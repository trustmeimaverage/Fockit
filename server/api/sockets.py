import socketio
import asyncio
import time
from asgiref.sync import sync_to_async
from . import game_manager as gm

sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*', ping_timeout=20, ping_interval=10)

def get_game_room(pin):
    return f"game:{pin}"

def get_host_room(pin):
    return f"host:{pin}"

# Save session wrappers
async def get_session(sid):
    try:
        return await sio.get_session(sid)
    except:
        return {}

async def save_session(sid, data):
    await sio.save_session(sid, data)

# Event Handlers
@sio.event
async def connect(sid, environ):
    pass

@sio.event
async def disconnect(sid):
    session = await get_session(sid)
    role = session.get('role')
    pin = session.get('pin')
    if not pin:
        return

    if role == 'host':
        game = gm.get_game(pin)
        if not game:
            return
        if game['state'] in ['STARTING', 'QUESTION_ACTIVE', 'QUESTION_RESULTS']:
            await sio.emit('host:disconnected', {'resumeIn': 60}, room=get_game_room(pin))
            
            async def host_timeout_task():
                await asyncio.sleep(60)
                await sio.emit('game:terminated', room=get_game_room(pin))
                gm.delete_game(pin)
            
            task = asyncio.create_task(host_timeout_task())
            gm.set_host_timeout(pin, task)
    
    elif role == 'client':
        await handle_client_disconnect(sid, session)

async def handle_client_disconnect(sid, session):
    pin = session.get('pin')
    nickname = session.get('nickname')
    if not pin or not nickname:
        return
    
    gm.mark_player_disconnected(pin, nickname)
    players = gm.get_active_players(pin)
    await sio.emit('lobby:update', {'players': players}, room=get_game_room(pin))

    async def client_timeout_task():
        await asyncio.sleep(30)
        gm.remove_player_if_disconnected(pin, nickname)
        game = gm.get_game(pin)
        if game and game['state'] == 'LOBBY':
            await sio.emit('lobby:update', {'players': gm.get_active_players(pin)}, room=get_game_room(pin))
    
    asyncio.create_task(client_timeout_task())

# ── HOST ──

@sio.on('host:join')
async def host_join(sid, data):
    pin = data.get('pin', '').upper()
    game = gm.get_game(pin)
    if not game:
        return {'success': False, 'error': 'Game not found'}

    await sio.enter_room(sid, get_game_room(pin))
    await sio.enter_room(sid, get_host_room(pin))
    await save_session(sid, {'role': 'host', 'pin': pin})
    gm.set_host_socket(pin, sid)
    gm.clear_host_timeout(pin)

    if game['state'] != 'LOBBY':
        await sio.emit('host:reconnected', room=get_game_room(pin))

    return {
        'success': True,
        'state': game['state'],
        'gameName': game['gameName'],
        'players': gm.get_active_players(pin),
        'currentQuestionIndex': game['currentQuestionIndex'],
        'totalQuestions': len(game['questions']),
    }

@sio.on('host:start')
async def host_start(sid, data):
    session = await get_session(sid)
    pin = session.get('pin')
    game = gm.get_game(pin)
    if not game or game['hostSocketId'] != sid:
        return
    if game['state'] != 'LOBBY':
        return
    if len(gm.get_active_players(pin)) == 0:
        return

    gm.set_state(pin, 'STARTING')
    await sio.emit('game:starting', {'gameName': game['gameName']}, room=get_game_room(pin))

    async def delayed_start_q0():
        await asyncio.sleep(6)
        await start_question(pin, 0)
    
    task = asyncio.create_task(delayed_start_q0())
    gm.set_question_timeout(pin, task)
    return {'success': True}

@sio.on('host:next')
async def host_next(sid):
    session = await get_session(sid)
    pin = session.get('pin')
    game = gm.get_game(pin)
    if not game or game['hostSocketId'] != sid:
        return
    if game['state'] != 'QUESTION_RESULTS':
        return

    gm.clear_advance_timeout(pin)
    next_idx = game['currentQuestionIndex'] + 1
    if next_idx >= len(game['questions']):
        await end_game(pin)
    else:
        await start_question(pin, next_idx)

@sio.on('host:play_again')
async def host_play_again(sid):
    session = await get_session(sid)
    pin = session.get('pin')
    game = gm.get_game(pin)
    if not game or game['hostSocketId'] != sid:
        return

    gm.reset_game(pin)
    players = gm.get_active_players(pin)
    await sio.emit('lobby:reset', {'players': players}, room=get_game_room(pin))

# ── CLIENT ──

@sio.on('game:join')
async def game_join(sid, data):
    pin = data.get('pin', '').upper()
    nickname = data.get('nickname', '').strip()
    
    game = gm.get_game(pin)
    if not game:
        return {'success': False, 'error': 'Game not found'}
    if game['state'] != 'LOBBY':
        return {'success': False, 'error': 'Game already started'}
    if not nickname or len(nickname) < 1 or len(nickname) > 20:
        return {'success': False, 'error': 'Invalid nickname'}
    if gm.is_nickname_taken(pin, nickname):
        return {'success': False, 'error': 'Nickname already taken'}

    gm.add_player(pin, sid, nickname)
    await sio.enter_room(sid, get_game_room(pin))
    await save_session(sid, {'role': 'client', 'pin': pin, 'nickname': nickname})

    players = gm.get_active_players(pin)
    await sio.emit('lobby:update', {'players': players}, room=get_game_room(pin))

    return {'success': True, 'gameName': game['gameName']}

@sio.on('answer:submit')
async def answer_submit(sid, data):
    question_index = data.get('questionIndex')
    answer_index = data.get('answerIndex')
    
    session = await get_session(sid)
    pin = session.get('pin')
    nickname = session.get('nickname')
    game = gm.get_game(pin)
    
    if not game or game['state'] != 'QUESTION_ACTIVE':
        return {'accepted': False, 'error': 'Not accepting answers'}
    if game['currentQuestionIndex'] != question_index:
        return {'accepted': False, 'error': 'Wrong question'}
    
    now = int(time.time() * 1000)
    if now > game['questionEndsAt']:
        return {'accepted': False, 'error': 'Time expired'}

    ok = gm.submit_answer(pin, nickname, answer_index, now)
    if not ok:
        return {'accepted': False, 'error': 'Already answered'}

    dist = gm.get_answer_distribution(pin, question_index)
    count = gm.get_answer_count(pin)
    
    await sio.emit('host:answer_update', {
        'answerCount': count,
        'totalPlayers': len([p for p in game['players'] if p.get('connected')]),
        'distribution': dist
    }, room=get_host_room(pin))
    
    return {'accepted': True}

@sio.on('game:leave')
async def game_leave(sid):
    session = await get_session(sid)
    await handle_client_disconnect(sid, session)

# ── LOGIC HELPER ──

async def start_question(pin, question_index):
    game = gm.get_game(pin)
    if not game:
        return

    q = game['questions'][question_index]
    timer_ms = q['timer'] * 1000
    buffer_ms = 3000 if question_index == 0 else 0
    ends_at = int(time.time() * 1000) + timer_ms + buffer_ms

    gm.set_state(pin, 'QUESTION_ACTIVE')
    gm.set_current_question(pin, question_index, ends_at)

    payload = {
        'questionIndex': question_index,
        'totalQuestions': len(game['questions']),
        'type': q['type'],
        'question': q['question'],
        'timer': q['timer'],
        'endsAt': ends_at,
        'gameName': game['gameName']
    }
    if q['type'] == 'quiz':
        payload['options'] = q.get('options')

    await sio.emit('question:start', payload, room=get_game_room(pin))

    async def auto_end_question():
        await asyncio.sleep((timer_ms + buffer_ms) / 1000.0)
        await end_question(pin, question_index)
        
    task = asyncio.create_task(auto_end_question())
    gm.set_question_timeout(pin, task)

async def end_question(pin, question_index):
    game = gm.get_game(pin)
    if not game or game['state'] != 'QUESTION_ACTIVE':
        return
    if game['currentQuestionIndex'] != question_index:
        return

    scores = gm.calculate_and_apply_scores(pin, question_index)
    correct = gm.get_correct_answer(pin, question_index)
    dist = gm.get_answer_distribution(pin, question_index)

    gm.set_state(pin, 'QUESTION_RESULTS')

    await sio.emit('question:end', {
        'questionIndex': question_index,
        'type': game['questions'][question_index]['type'],
        'correctAnswer': correct['index'],
        'correctAnswerText': correct['text'],
        'answerStats': dist,
        'scores': scores,
        'isLastQuestion': question_index == len(game['questions']) - 1
    }, room=get_game_room(pin))

    next_idx = question_index + 1
    async def auto_advance():
        await asyncio.sleep(8)
        g = gm.get_game(pin)
        if not g or g['state'] != 'QUESTION_RESULTS':
            return
        if next_idx >= len(g['questions']):
            await end_game(pin)
        else:
            await start_question(pin, next_idx)

    task = asyncio.create_task(auto_advance())
    gm.set_advance_timeout(pin, task)

async def end_game(pin):
    game = gm.get_game(pin)
    if not game:
        return
    gm.set_state(pin, 'GAME_END')
    leaderboard = gm.get_leaderboard(pin)
    await sio.emit('game:end', {'leaderboard': leaderboard}, room=get_game_room(pin))
    
    # Save to db
    from asgiref.sync import sync_to_async
    @sync_to_async
    def save_db():
        from api.models import Game, GameQuestion, GamePlayer
        try:
            db_game = Game.objects.create(pin=pin, game_name=game['gameName'])
            db_game.ended_at = db_game.created_at # Need real timezone.now()
            from django.utils import timezone
            db_game.ended_at = timezone.now()
            db_game.save()
            
            for i, q in enumerate(game['questions']):
                GameQuestion.objects.create(
                    game=db_game,
                    question_index=i,
                    type=q['type'],
                    question=q['question'],
                    options=q.get('options') if q['type'] == 'quiz' else None,
                    correct_index=q.get('correctIndex') if q['type'] == 'quiz' else None,
                    correct=q.get('correct') if q['type'] == 'truefalse' else None,
                    timer=q['timer']
                )
            
            for i, lb in enumerate(leaderboard):
                GamePlayer.objects.create(
                    game=db_game,
                    nickname=lb['nickname'],
                    score=lb['score'],
                    rank=i + 1
                )
        except Exception as e:
            print("DB Save Error:", e)

    asyncio.create_task(save_db())

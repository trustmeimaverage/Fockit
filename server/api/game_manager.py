import random
import time
import asyncio

games = {}

def generate_pin():
    chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    while True:
        pin = ''.join(random.choices(chars, k=6))
        if pin not in games:
            return pin

def create_game(game_name, questions):
    pin = generate_pin()
    game = {
        'pin': pin,
        'gameName': game_name,
        'questions': questions,
        'state': 'LOBBY',
        'players': [],
        'scores': {},
        'answers': {},
        'hostSocketId': None,
        'hostTimeout': None,
        'questionTimeout': None,
        'advanceTimeout': None,
        'currentQuestionIndex': 0,
        'questionEndsAt': None,
        'createdAt': time.time(),
    }
    games[pin] = game
    return game

def get_game(pin):
    return games.get(pin)

def delete_game(pin):
    game = games.get(pin)
    if game:
        if game.get('hostTimeout'):
            game['hostTimeout'].cancel()
        if game.get('questionTimeout'):
            game['questionTimeout'].cancel()
        if game.get('advanceTimeout'):
            game['advanceTimeout'].cancel()
    if pin in games:
        del games[pin]

def set_host_socket(pin, socket_id):
    g = games.get(pin)
    if g:
        g['hostSocketId'] = socket_id

def set_state(pin, state):
    g = games.get(pin)
    if g:
        g['state'] = state

def set_current_question(pin, index, ends_at):
    g = games.get(pin)
    if not g:
        return
    g['currentQuestionIndex'] = index
    g['questionEndsAt'] = ends_at
    if index not in g['answers']:
        g['answers'][index] = {}

def add_player(pin, socket_id, nickname):
    g = games.get(pin)
    if not g:
        return None
    player = {'socketId': socket_id, 'nickname': nickname, 'connected': True}
    g['players'].append(player)
    g['scores'][nickname] = 0
    return player

def get_active_players(pin):
    g = games.get(pin)
    if not g:
        return []
    return [{'nickname': p['nickname']} for p in g['players'] if p.get('connected')]

def is_nickname_taken(pin, nickname):
    g = games.get(pin)
    if not g:
        return False
    return any(p['nickname'].lower() == nickname.lower() and p.get('connected') for p in g['players'])

def mark_player_disconnected(pin, nickname):
    g = games.get(pin)
    if not g:
        return
    for p in g['players']:
        if p['nickname'] == nickname:
            p['connected'] = False

def remove_player_if_disconnected(pin, nickname):
    g = games.get(pin)
    if not g:
        return
    for p in g['players']:
        if p['nickname'] == nickname and not p.get('connected'):
            g['players'] = [pl for pl in g['players'] if pl['nickname'] != nickname]
            if nickname in g['scores']:
                del g['scores'][nickname]
            break

def submit_answer(pin, nickname, answer_index, submitted_at):
    g = games.get(pin)
    if not g:
        return False
    q_idx = g['currentQuestionIndex']
    if q_idx not in g['answers']:
        g['answers'][q_idx] = {}
    if nickname in g['answers'][q_idx]:
        return False
    g['answers'][q_idx][nickname] = {'answerIndex': answer_index, 'submittedAt': submitted_at}
    return True

def get_answer_count(pin):
    g = games.get(pin)
    if not g:
        return 0
    return len(g['answers'].get(g['currentQuestionIndex'], {}))

def get_answer_distribution(pin, question_index):
    g = games.get(pin)
    if not g:
        return []
    q = g['questions'][question_index]
    count = 2 if q['type'] == 'truefalse' else 4
    dist = [0] * count
    for ans in g['answers'].get(question_index, {}).values():
        ans_idx = ans['answerIndex']
        if 0 <= ans_idx < count:
            dist[ans_idx] += 1
    return dist

def calculate_and_apply_scores(pin, question_index):
    g = games.get(pin)
    if not g:
        return {}
    q = g['questions'][question_index]
    ends_at = g['questionEndsAt']
    total_ms = q['timer'] * 1000
    correct_idx = (0 if q['correct'] else 1) if q['type'] == 'truefalse' else q['correctIndex']
    
    for nickname, ans in g['answers'].get(question_index, {}).items():
        if ans['answerIndex'] == correct_idx:
            remaining = max(0, ends_at - ans['submittedAt'])
            pts = round(1000 * (remaining / total_ms))
            g['scores'][nickname] = g['scores'].get(nickname, 0) + pts
            
    return dict(g['scores'])

def get_correct_answer(pin, question_index):
    g = games.get(pin)
    if not g:
        return None
    q = g['questions'][question_index]
    if q['type'] == 'truefalse':
        return {'index': 0 if q['correct'] else 1, 'text': 'True' if q['correct'] else 'False'}
    return {'index': q['correctIndex'], 'text': q['options'][q['correctIndex']]}

def get_leaderboard(pin):
    g = games.get(pin)
    if not g:
        return []
    lb = [{'nickname': nickname, 'score': score} for nickname, score in g['scores'].items()]
    return sorted(lb, key=lambda x: x['score'], reverse=True)

def set_host_timeout(pin, timeout_task):
    g = games.get(pin)
    if g:
        g['hostTimeout'] = timeout_task

def clear_host_timeout(pin):
    g = games.get(pin)
    if g and g.get('hostTimeout'):
        g['hostTimeout'].cancel()
        g['hostTimeout'] = None

def set_question_timeout(pin, timeout_task):
    g = games.get(pin)
    if not g:
        return
    if g.get('questionTimeout'):
        g['questionTimeout'].cancel()
    g['questionTimeout'] = timeout_task

def set_advance_timeout(pin, timeout_task):
    g = games.get(pin)
    if not g:
        return
    if g.get('advanceTimeout'):
        g['advanceTimeout'].cancel()
    g['advanceTimeout'] = timeout_task

def clear_advance_timeout(pin):
    g = games.get(pin)
    if g and g.get('advanceTimeout'):
        g['advanceTimeout'].cancel()
        g['advanceTimeout'] = None

def reset_game(pin):
    g = games.get(pin)
    if not g:
        return
    if g.get('questionTimeout'):
        g['questionTimeout'].cancel()
    if g.get('advanceTimeout'):
        g['advanceTimeout'].cancel()
    g['state'] = 'LOBBY'
    g['currentQuestionIndex'] = 0
    g['questionEndsAt'] = None
    g['answers'] = {}
    g['scores'] = {}
    g['questionTimeout'] = None
    g['advanceTimeout'] = None
    g['players'] = [p for p in g['players'] if p.get('connected')]
    for p in g['players']:
        g['scores'][p['nickname']] = 0

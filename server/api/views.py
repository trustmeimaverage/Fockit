from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json
from . import game_manager as gm
from .models import Game
from django.db.models import Count

@csrf_exempt
def create_game(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            game_name = data.get('gameName')
            questions = data.get('questions')
            
            if not game_name or not isinstance(questions, list) or len(questions) == 0:
                return JsonResponse({'error': 'Invalid game data'}, status=400)
            
            game = gm.create_game(game_name, questions)
            return JsonResponse({'pin': game['pin']})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)
    return JsonResponse({'error': 'Method not allowed'}, status=405)

def check_game(request, pin):
    if request.method == 'GET':
        pin = pin.upper()
        game = gm.get_game(pin)
        if not game:
            return JsonResponse({'error': 'Game not found'}, status=404)
        if game['state'] != 'LOBBY':
            return JsonResponse({'error': 'Game already started'}, status=409)
        
        return JsonResponse({
            'exists': True,
            'gameName': game['gameName'],
            'playerCount': len(gm.get_active_players(pin))
        })
    return JsonResponse({'error': 'Method not allowed'}, status=405)

def game_history(request):
    if request.method == 'GET':
        games = Game.objects.filter(ended_at__isnull=False).annotate(
            question_count=Count('questions', distinct=True),
            player_count=Count('players', distinct=True)
        ).order_by('-ended_at')[:20]
        
        data = []
        for g in games:
            data.append({
                'id': g.id,
                'pin': g.pin,
                'game_name': g.game_name,
                'ended_at': g.ended_at.isoformat() if g.ended_at else None,
                'question_count': g.question_count,
                'player_count': g.player_count
            })
        return JsonResponse(data, safe=False)
    return JsonResponse({'error': 'Method not allowed'}, status=405)

def game_history_detail(request, game_id):
    if request.method == 'GET':
        try:
            g = Game.objects.get(id=game_id)
            data = {
                'id': g.id,
                'pin': g.pin,
                'game_name': g.game_name,
                'ended_at': g.ended_at.isoformat() if g.ended_at else None,
                'questions': list(g.questions.order_by('question_index').values(
                    'question_index', 'type', 'question', 'options', 'correct_index', 'correct', 'timer'
                )),
                'leaderboard': list(g.players.order_by('rank').values(
                    'nickname', 'score', 'rank'
                ))
            }
            return JsonResponse(data)
        except Game.DoesNotExist:
            return JsonResponse({'error': 'Not found'}, status=404)
    return JsonResponse({'error': 'Method not allowed'}, status=405)

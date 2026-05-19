from django.db import models
from django.utils import timezone

class Game(models.Model):
    pin = models.CharField(max_length=8)
    game_name = models.TextField()
    created_at = models.DateTimeField(default=timezone.now)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'games'

class GameQuestion(models.Model):
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name='questions')
    question_index = models.IntegerField()
    type = models.CharField(max_length=16)
    question = models.TextField()
    options = models.JSONField(null=True, blank=True)
    correct_index = models.IntegerField(null=True, blank=True)
    correct = models.BooleanField(null=True, blank=True)
    timer = models.IntegerField()

    class Meta:
        db_table = 'game_questions'

class GamePlayer(models.Model):
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name='players')
    nickname = models.TextField()
    score = models.IntegerField(default=0)
    rank = models.IntegerField()
    finished_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'game_players'

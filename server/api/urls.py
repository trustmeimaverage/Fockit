from django.urls import path
from . import views

urlpatterns = [
    path('games', views.create_game),
    path('games/<str:pin>', views.check_game),
    path('history', views.game_history),
    path('history/<int:game_id>', views.game_history_detail),
]

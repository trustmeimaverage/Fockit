import os
import django
from django.core.asgi import get_asgi_application
import socketio

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'fockit_project.settings')
django.setup()

django_asgi_app = get_asgi_application()

from api.sockets import sio

application = socketio.ASGIApp(sio, django_asgi_app)

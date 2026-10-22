# Сеть совместного просмотра AnimeBox (Версия 2)

Этот патч разделяет приложение и сетевую инфраструктуру:

- **PeerServer** = используется только для сигнального трафика (signaling). Он не ретранслирует видеопоток или сообщения чата.
- **TURN** = резервный ретранслятор для WebRTC DataChannel на случай, если прямое P2P-соединение заблокировано VPN, CGNAT, симметричным NAT или строгими сетевыми политиками.
- Само аниме-видео по-прежнему загружается каждым участником независимо из настроенного плеера/провайдера. TURN переносит только трафик DataChannel комнаты совместного просмотра (чат + команды воспроизведения, паузы, перемотки и синхронизации).

## Рекомендуемая топология для продакшена

```text
youranimebox.com (Vercel)
        |
        | GET /api/watch-party/network
        |
Браузер А ---- peer.youranimebox.com:443 ---- Браузер Б
        \                                   /
         \------ прямое WebRTC P2P --------/
          \---- Резервный TURN (при необходимости) --/
```

Для максимальной совместимости откройте TURN как:

- `turn:turn.youranimebox.com:3478?transport=udp`
- `turn:turn.youranimebox.com:3478?transport=tcp`
- `turns:turn.youranimebox.com:443?transport=tcp`

Адрес `turns:...:443` крайне полезен в сетях и VPN, которые блокируют UDP или нестандартные порты.

### Важное примечание о портах

Обычный HTTPS обратный прокси (reverse proxy) и сервер coturn не могут одновременно использовать один и тот же публичный адрес `IP:443`. Простейшая конфигурация для продакшена выглядит так:

1. Разверните PeerServer на одном хосте/IP (или на платформе, поддерживающей постоянные WebSocket-соединения).
2. Разверните coturn на другом небольшом VPS / публичном IP, чтобы протокол TURN/TLS мог полностью занять порт 443.

Вы также можете использовать мультиплексор L4 TLS, но это более сложная схема.

## 1. Настройка PeerServer

Запуск из директории `infra/watch-party/peer-server`:

```bash
docker build -t animebox-peer .
docker run -d \
  --name animebox-peer \
  --restart unless-stopped \
  -p 127.0.0.1:9000:9000 \
  -e PEER_PATH=/peerjs \
  -e PEER_KEY=animebox \
  -e PEER_PROXIED=true \
  animebox-peer
```

Настройте nginx или Caddy перед ним с поддержкой HTTPS и WebSockets. Пример конфигурации для nginx находится в файле `nginx-peer.conf.example`.

## 2. Настройка coturn

Установите coturn на выделенный TURN-хост/VPS и скопируйте шаблон конфигурации `coturn/turnserver.conf.example` в ваш реальный файл конфигурации.

Откройте следующие порты:

- TCP/UDP `3478`
- TCP `443` для TURNS
- Диапазон портов для UDP-ретрансляции: `49160-49200`

Сгенерируйте длинный случайный секрет для `static-auth-secret`. Точно такое же значение необходимо добавить в переменные окружения Vercel как `WATCH_PARTY_TURN_SECRET`.

Режим общего секрета (shared-secret) в coturn генерирует временные учетные данные. AnimeBox никогда не отправляет реальный секретный ключ в браузер пользователя.

## 3. Переменные окружения Vercel

Рекомендуемые настройки:

```env
WATCH_PARTY_SIGNAL_HOST=peer.youranimebox.com
WATCH_PARTY_SIGNAL_PORT=443
WATCH_PARTY_SIGNAL_PATH=/peerjs
WATCH_PARTY_SIGNAL_SECURE=true
WATCH_PARTY_SIGNAL_KEY=animebox

WATCH_PARTY_STUN_URLS=stun:turn.youranimebox.com:3478,stun:stun.l.google.com:19302

WATCH_PARTY_TURN_URLS=turn:turn.youranimebox.com:3478?transport=udp,turn:turn.youranimebox.com:3478?transport=tcp,turns:turn.youranimebox.com:443?transport=tcp
WATCH_PARTY_TURN_SECRET=ЗАМЕНИТЕ_НА_ТОТ_ЖЕ_СЕКРЕТ_ИЗ_COTURN_SHARED_SECRET
WATCH_PARTY_TURN_TTL_SECONDS=3600

# Использовать только для отладки. На продакшене всегда должно быть false.
WATCH_PARTY_FORCE_RELAY=false
```

Если вы используете облачный провайдер TURN-серверов с фиксированными учетными данными вместо режима общего секрета coturn:

```env
WATCH_PARTY_TURN_URLS=...
WATCH_PARTY_TURN_USERNAME=...
WATCH_PARTY_TURN_CREDENTIAL=...
```

В таком режиме задавать переменную `WATCH_PARTY_TURN_SECRET` не нужно.

## 4. Тестирование

Проверьте работоспособность в четырех сценариях:

1. В одной Wi-Fi сети, без VPN: на экране должно отображаться состояние `P2P`.
2. Из разных сетей / стран: пользователи должны успешно подключаться друг к другу.
3. Один из участников находится за VPN или мобильной сетью: статус соединения может измениться на `TURN RELAY`.
4. Установите `WATCH_PARTY_FORCE_RELAY=true`, сделайте редеплой и создайте новую комнату: на экране ОБЯЗАТЕЛЬНО должно отобразиться состояние `TURN RELAY`. После проверки немедленно верните значение в `false`.

Если при принудительном реле (force-relay) соединение не устанавливается, значит TURN-сервер недоступен или настроен неверно.

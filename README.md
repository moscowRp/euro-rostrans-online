# EuroRosTrans Online (Регистрация + роли)

## Что это
Мини веб-приложение:
- регистрация / вход
- роли: LOGIST (логист) и DRIVER (водитель)
- водитель видит только свои отчёты
- логист видит все отчёты и может удалять

## Как запустить локально

### 1) API (сервер)
```bash
cd server
npm i
cp .env.example .env
npm run dev
```

### 2) Frontend
Самое простое — VS Code Live Server (порт 5500).
Либо:
```bash
cd web
python -m http.server 5500
```

Открыть: http://localhost:5500

## Как залить на хостинг

### Frontend
Залей папку `web/` как статический сайт (Netlify / Vercel / Render Static / любой хостинг).

### Backend
Залей папку `server/` на Node.js хостинг (Render / Fly / VPS).
Нужно задать переменные окружения (аналог .env):

- PORT=8080 (или какой даст хостинг)
- JWT_SECRET=сложный_секрет
- DB_PATH=./data.sqlite (или путь к диску/volume на хостинге)
- CORS_ORIGIN=https://ваш-фронт-домен

На фронте в поле "Адрес API" укажи URL сервера, например:
`https://your-api.onrender.com`

## Важно про безопасность
Сейчас любой может выбрать роль LOGIST при регистрации.
Если хочешь — добавлю:
- роль LOGIST только по секретному коду
- или создание логистов только админом

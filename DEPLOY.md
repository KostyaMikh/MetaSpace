# Инструкция по деплою на GitHub Pages

## Шаги для деплоя клиента на GitHub Pages:

### 1. Убедитесь, что код закоммичен в Git

```bash
git add .
git commit -m "Prepare for GitHub Pages deployment"
git push origin main
```

> **Примечание:** Если ваша основная ветка называется `master`, используйте `master` вместо `main`.

### 2. Включите GitHub Pages в настройках репозитория

1. Откройте ваш репозиторий на GitHub
2. Перейдите в **Settings** (Настройки)
3. В левом меню найдите **Pages**
4. В разделе **Source** выберите:
   - Source: **GitHub Actions**

### 3. Запустите деплой

После того как вы запушите код с файлом `.github/workflows/deploy.yml`, GitHub Actions автоматически:
- Соберет проект
- Задеплоит папку `client` на GitHub Pages

Вы можете отслеживать процесс деплоя:
1. Перейдите во вкладку **Actions** в вашем репозитории
2. Найдите workflow "Deploy to GitHub Pages"
3. Дождитесь завершения (зеленая галочка)

### 4. Получите URL вашего сайта

После успешного деплоя ваш сайт будет доступен по адресу:
```
https://<ваш-username>.github.io/<название-репозитория>/
```

Например, если ваш username `kostia` и репозиторий `MetaSpace`:
```
https://kostia.github.io/MetaSpace/
```

## Обновление сайта

Каждый раз, когда вы пушите изменения в ветку `main` (или `master`), сайт будет автоматически обновляться.

## Ручной запуск деплоя

Вы также можете запустить деплой вручную:
1. Перейдите во вкладку **Actions**
2. Выберите workflow "Deploy to GitHub Pages"
3. Нажмите **Run workflow**
4. Выберите ветку и нажмите **Run workflow**

## Проверка статуса

Текущий URL вашего сайта можно найти в:
- **Settings → Pages** (в разделе "Your site is live at...")
- Или в логах успешного деплоя в **Actions**

## Важно

Клиент уже настроен на подключение к серверу на Render:
```javascript
const WS_BASE_URL = 'wss://metaspace-server.onrender.com';
```

Убедитесь, что сервер запущен и доступен по этому адресу.

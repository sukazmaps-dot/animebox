AnimeBox Production Integrity + Community v1.1 Patch
=====================================================

Что исправляет патч
-------------------
1. Profile Media Safety теперь private-first:
   - браузер больше не публикует новый аватар/баннер напрямую в public profile-media;
   - сервер выдаёт signed upload только в private profile-media-quarantine;
   - moderation читает файл из quarantine;
   - ALLOW -> server-side publish в profile-media;
   - REVIEW -> файл остаётся только в private quarantine до решения администратора;
   - BLOCK -> файл удаляется и не становится публичным.

2. Закрывается обход модерации через прямой Supabase Storage upload:
   - production-integrity-hotfix.sql удаляет browser INSERT/UPDATE policies для public profile-media;
   - public bucket получает MIME allow-list и лимит 8 MB.

3. SECURITY DEFINER hardening:
   - anon больше не должен иметь EXECUTE на chat write RPC;
   - trigger/media guard helpers закрываются от anon/authenticated Data API calls;
   - authenticated сохраняет только нужные chat create/delete/reaction RPC.

4. Community v1.1:
   - reports, moderation, mute/ban, slow mode;
   - mentions/reply notifications;
   - unread state;
   - pinned + system messages;
   - reconnect/offline UX;
   - optimistic sending;
   - исправлен TypeScript nullable me в GlobalChatV11Client.

5. DB performance:
   - добавлены FK indexes для Community и Profile Media review tables.

6. Git/deploy integrity:
   - package.json и package-lock.json синхронизированы на Node 22.x;
   - supabase/migrations/ больше не игнорируется в .gitignore;
   - SQL Profile Media Safety и Community v1.1 находятся в Git;
   - добавлен idempotent supabase/production-integrity-hotfix.sql.

Порядок установки
-----------------
1. Распаковать ZIP поверх текущего animebox-git.

2. Локально:
   npm install
   npm run build

3. Сначала отправить код в Git/Vercel и дождаться успешного production build.

4. ПОСЛЕ успешного deploy выполнить в Supabase SQL Editor:
   supabase/production-integrity-hotfix.sql

   На текущей БД Community v1.1 и Profile Media Safety schema уже существуют.
   Для чистой/новой БД сначала выполнить:
   - supabase/global-chat-v1.sql
   - supabase/global-chat-v1-1.sql
   - supabase/profile-media-safety-v1.sql
   затем production-integrity-hotfix.sql.

5. Проверить:
   - /profile/edit: обычный avatar + banner
   - /profile/edit?tab=style: Premium avatar + banner
   - unsafe/borderline media не появляется публично до approval
   - /admin/community/media approve/reject
   - /chat reports / mentions / replies / slow mode
   - /admin/community

Проверка сборки патча
---------------------
- `tsc --noEmit` проходит без TypeScript errors.
- targeted ESLint для новых Community/integrity server files: 0 errors; остаются только 3 no-img-element warnings в chat UI.
- Полный Next build в изолированном окружении не был завершён, потому что Next попытался скачать Linux SWC с registry.npmjs.org, а сеть контейнера недоступна. На Vercel/local machine обязательно выполнить `npm run build`.

Git
---
git status
git add -A
git commit -m "Harden profile media and ship Community v1.1"
git push origin main
git status

Важно
-----
Не запускай production-integrity-hotfix.sql ДО deploy нового кода: старые upload-компоненты рассчитывают на прямой INSERT в public profile-media. Новый код уже использует private signed-upload flow и будет работать после удаления public INSERT/UPDATE policies.

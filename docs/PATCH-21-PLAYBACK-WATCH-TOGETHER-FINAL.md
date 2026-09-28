# Patch 21 — Playback & Watch Together Final

## 0. Цель релиза

Patch 21 закрывает просмотр как целостный продуктовый контур AnimeBox: обычный просмотр, Kodik/direct playback, resume, OP/ED automation, переходы между сериями и Watch Together должны использовать одни и те же безопасные правила и не создавать дублирующие команды, рывки или неожиданные переходы.

Главный критерий релиза: пользователь не должен замечать служебную механику плеера.

---

## 1. Инварианты Playback Core

### 1.1 Команда воспроизведения должна быть идемпотентной
- PLAY не отправляется повторно, если плеер уже играет.
- PAUSE не отправляется повторно, если плеер уже стоит на паузе.
- SEEK не повторяется, если текущая позиция уже практически совпадает с целью.
- Повторная Watch Together команда с тем же/старым sequence number не применяется.
- Повторный UI event в пределах debounce window не должен создавать вторую команду.

### 1.2 Episode transition exactly-once
- один фактический ended -> один end flow;
- один end flow -> максимум один route transition;
- одновременный клик по кнопке и истечение auto-next timer не могут вызвать onEnded дважды;
- смена серии полностью сбрасывает transition latch.

### 1.3 Resume integrity
- обычный resume и source-switch resume не смешиваются;
- смена источника/озвучки сохраняет текущую позицию;
- near-end resume не возвращает пользователя в практически завершённую серию;
- failed source не может записать ошибочный нулевой прогресс;
- после перехода на новую серию старый resume gate не переносится.

### 1.4 OP / ED automation
- OP autoskip выполняется максимум один раз на episode generation;
- первый неточный timestamp не является достаточным основанием для seek;
- пользовательский seek около OP отключает принудительный autoskip;
- ED никогда не считается окончанием видео;
- auto-next разрешается только после реального/подтверждённого ended;
- длинные эпизоды и фильмы проходят отдельные regression cases.

### 1.5 Source continuity
- ручной provider preference сохраняется;
- translation preference сохраняется между сериями одного тайтла;
- source fallback сохраняет позицию;
- fallback не должен бесконечно вращаться между уже failed candidates;
- source/translation switch сбрасывает stale OP timing samples.

---

## 2. Watch Together Final

### 2.1 Authoritative command flow
Host/room network command получает monotonic sequence. Player применяет только новые команды.

Pipeline:

UI/network -> validate -> dedupe -> apply idempotently -> publish observed state.

Никакой входящий command не должен автоматически превращаться обратно в исходящий command.

### 2.2 Drift policy
- малый drift: не трогаем playback;
- средний drift: корректируем только при sync boundary;
- крупный drift: bounded seek;
- explicit host seek: применяется сразу, но только если позиция реально отличается;
- никакой seek oscillation вокруг одной точки.

### 2.3 Play/pause
- authoritative PLAY применяется только к paused player;
- authoritative PAUSE применяется только к playing player;
- inferred provider state не считается пользовательской командой;
- повторная доставка packet безопасна.

### 2.4 Reconnect
- offline -> reconnecting;
- online/visibility restore -> восстановление transport;
- reconnect не пересоздаёт комнату, если transport ещё жив;
- host role не теряется от краткой background pause;
- guest получает свежий authoritative sync после reconnect.

### 2.5 Host migration
- только одна host epoch считается актуальной;
- stale host transfer игнорируется;
- новый host продолжает sync sequence;
- room не должна одновременно иметь двух управляющих host.

### 2.6 Abuse / spam shield
- rate-limit локальных control events;
- duplicate seek suppression;
- bounded target position;
- participant без нужной роли не может генерировать authoritative control;
- chat/reaction spam не влияет на player hot path.

---

## 3. Mobile Watch Together

- 16:9 player geometry не схлопывается;
- одна экранная модель: Player + active tab;
- Chat / Episodes & Voting / Room;
- mobile selectors не дублируют player state;
- safe-area bottom/top;
- fullscreen не создаёт второй control layer;
- keyboard/chat не ломает player height;
- reconnect state видим без полного layout shift.

---

## 4. Performance budget

### Normal playback
- Watch Together listeners/events не работают при watchTogetherMode=false;
- один provider time sample -> один meaningful playback state update;
- отсутствие React setState на каждом time sample, если значение не нужно UI;
- никаких polling loops быстрее фактической provider cadence.

### Watch Together
- high-frequency state не должен ререндерить тяжёлые room blocks;
- packet dedupe до React state update;
- chat/reactions отделены от playback sync path;
- синхронизация должна масштабироваться до комнаты 20–50 участников без O(n) React updates на каждый video tick.

---

## 5. Observability

События:
- player_start_requested
- player_started
- player_source_switched
- player_source_failed
- player_resume_applied
- player_completed
- playback_unexpected_seek
- playback_rebuffer
- watch_party_drift_corrected
- watch_party_duplicate_command_dropped
- watch_party_reconnect

Метрики должны быть sampled/bounded и не создавать новую нагрузку на hot path.

---

## 6. Regression matrix

Обязательные сценарии:
1. 24m episode, OP present.
2. 24m episode, OP absent.
3. 45–60m episode.
4. Movie/long-form.
5. Manual seek before OP.
6. Manual seek inside OP.
7. Source switch mid-episode.
8. Translation switch mid-episode.
9. Provider time jitter.
10. Duplicate ended.
11. Auto-next timer + simultaneous manual next.
12. WT duplicate PLAYER_APPLY.
13. WT PLAY while already playing.
14. WT PAUSE while already paused.
15. WT seek to approximately current position.
16. Background -> foreground.
17. Offline -> online.
18. Host migration.
19. Mobile fullscreen.
20. Telegram Mini App fullscreen.

---

## 7. Release phases

### Phase A — Playback command integrity
- exactly-once episode transition;
- remote WT sequence dedupe;
- idempotent play/pause/seek;
- disable WT command listeners outside WT;
- regression gate.

### Phase B — Resume / source continuity
- source generation identity;
- translation/provider persistence verification;
- resume transition tests;
- fallback loop protection.

### Phase C — Timeline automation final
- OP/ED policy;
- long-form safety matrix;
- ending/manual cancel behavior;
- player timeline tests.

### Phase D — Watch Together sync final
- drift controller;
- host epoch/sequence integrity;
- reconnect authoritative resync;
- spam shield.

### Phase E — Mobile + UX final
- fullscreen;
- selectors;
- reconnect UI;
- one-screen layout final pass.

### Phase F — Release hardening
- full TypeScript/lint/build;
- playback regression suite;
- WT regression suite;
- production canary;
- final merge only after green gate.

---

## 8. Definition of Done

Patch 21 считается завершённым только если:
- нет известных double-seek/double-play/double-pause paths;
- episode navigation exactly-once;
- OP/ED/auto-next regression matrix зелёная;
- WT packet replay безопасен;
- reconnect не ломает room authority;
- mobile theater не имеет layout collapse/overflow;
- обычный просмотр не платит runtime cost за Watch Together;
- production build и все retention/security gates зелёные.

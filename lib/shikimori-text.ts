function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    quot: '"',
    apos: "'",
    lt: '<',
    gt: '>',
    nbsp: ' ',
  };

  return value
    .replace(
      /&(#x?[0-9a-f]+|[a-z]+);/gi,
      (match, entity: string) => {
        if (entity.startsWith('#x')) {
          const code = Number.parseInt(
            entity.slice(2),
            16,
          );

          return Number.isFinite(code)
            ? String.fromCodePoint(code)
            : match;
        }

        if (entity.startsWith('#')) {
          const code = Number.parseInt(
            entity.slice(1),
            10,
          );

          return Number.isFinite(code)
            ? String.fromCodePoint(code)
            : match;
        }

        return named[entity.toLowerCase()] ?? match;
      },
    );
}

export function cleanShikimoriDescription(
  value?: string | null,
): string {
  if (!value) {
    return '';
  }

  let text = value;

  // HTML-переносы.
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<\/div>\s*<div[^>]*>/gi, '\n');

  // Остальные HTML-теги.
  text = text.replace(/<[^>]+>/g, '');

  // BBCode-ссылки на сущности Shikimori.
  // Сами теги удаляем, но текст внутри сохраняем:
  // [character=723]Нами[/character] → Нами
  text = text.replace(
    /\[(?:\/)?(?:anime|manga|ranobe|character|person|club)(?:=[^\]]+)?\]/gi,
    '',
  );

  // Ссылки.
  text = text.replace(
    /\[(?:\/)?url(?:=[^\]]+)?\]/gi,
    '',
  );

  // Форматирование.
  text = text.replace(
    /\[(?:\/)?(?:b|i|u|s|spoiler|quote|center|left|right)\]/gi,
    '',
  );

  // BBCode с параметрами.
  text = text.replace(
    /\[(?:\/)?(?:color|size|font)(?:=[^\]]+)?\]/gi,
    '',
  );

  // Переносы.
  text = text
    .replace(/\[br\s*\/?\]/gi, '\n')
    .replace(/\[hr\s*\/?\]/gi, '\n');

  text = decodeHtmlEntities(text);

  // Убираем мусорные пробелы,
  // но сохраняем нормальные абзацы.
  text = text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}
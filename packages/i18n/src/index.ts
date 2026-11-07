export const SUPPORTED_LANGUAGES = ['ru', 'en'] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'en';

export const en = {
  'app.title': 'LinguaCall',
  'app.tagline': 'P2P video calls with real-time speech translation',
  'language.title': 'Your native language',
  'language.description': 'Subtitles and dubbing will be in this language.',
  'language.search': 'Search languages',
  'language.noResults': 'No languages found',
  'language.continue': 'Continue',
  'chat.title': 'Start a call',
  'chat.create': 'Create a chat',
  'chat.join': 'Join with a token',
  'chat.token': 'Invite token',
  'chat.copy': 'Copy',
  'chat.copied': 'Copied',
  'devices.title': 'Camera and microphone',
  'call.subtitles': 'Subtitles are on',
  'common.back': 'Back',
} as const;

export type MessageKey = keyof typeof en;

export const ru: Record<MessageKey, string> = {
  'app.title': 'LinguaCall',
  'app.tagline': 'P2P-видеосвязь с переводом речи в реальном времени',
  'language.title': 'Ваш родной язык',
  'language.description': 'На этом языке будут субтитры и озвучка перевода.',
  'language.search': 'Поиск языков',
  'language.noResults': 'Языки не найдены',
  'language.continue': 'Продолжить',
  'chat.title': 'Начать звонок',
  'chat.create': 'Создать чат',
  'chat.join': 'Подключиться по токену',
  'chat.token': 'Токен-приглашение',
  'chat.copy': 'Копировать',
  'chat.copied': 'Скопировано',
  'devices.title': 'Камера и микрофон',
  'call.subtitles': 'Субтитры включены',
  'common.back': 'Назад',
};

export const messages: Record<Language, Record<MessageKey, string>> = { ru, en };

/** Native and English names of every supported language. */
export const LANGUAGE_NAMES: Record<Language, { native: string; english: string }> = {
  ru: { native: 'Русский', english: 'Russian' },
  en: { native: 'English', english: 'English' },
};

export type MessageParams = Record<string, string | number>;

function format(template: string, params: MessageParams): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function translate(
  language: Language,
  key: MessageKey,
  params: MessageParams = {},
): string {
  const dictionary = messages[language] ?? messages[DEFAULT_LANGUAGE];
  const template = dictionary[key] ?? messages[DEFAULT_LANGUAGE][key];
  return format(template, params);
}

export type Translator = (key: MessageKey, params?: MessageParams) => string;

export function createTranslator(language: Language): Translator {
  return (key, params) => translate(language, key, params);
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function normalizeLanguage(value: unknown): Language {
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}

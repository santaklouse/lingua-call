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
  'chat.subtitle': 'Create a chat and share the invite token, or join with one.',
  'chat.create': 'Create a chat',
  'chat.join': 'Join with a token',
  'chat.token': 'Invite token',
  'chat.tokenPlaceholder': 'pnc1_…',
  'chat.shareLink': 'Invite link',
  'chat.shareHint': 'Send this link or token to the other participant.',
  'chat.newToken': 'New token',
  'chat.waiting': 'Waiting for the other participant…',
  'chat.tokenEmpty': 'Paste an invite token',
  'chat.tokenInvalidPrefix': 'Token must start with pnc1_',
  'chat.tokenInvalidPayload': 'Token payload looks corrupted',
  'chat.copy': 'Copy',
  'chat.copied': 'Copied',
  'devices.title': 'Camera and microphone',
  'translate.entry': 'Live translation demo',
  'translate.title': 'Live translation demo',
  'translate.subtitle': 'Speak into your microphone: see subtitles and hear the translation.',
  'translate.prototype': 'Prototype: browser built-in speech recognition and translation. Chrome/Edge recommended; may use vendor services. Local WASM engines are the next step.',
  'translate.start': 'Start listening',
  'translate.stop': 'Stop',
  'translate.clear': 'Clear',
  'translate.source': 'I speak',
  'translate.target': 'Translate to',
  'translate.swap': 'Swap languages',
  'translate.listening': 'Listening…',
  'translate.translating': 'Translating…',
  'translate.speaking': 'Speaking translation…',
  'translate.idle': 'Idle',
  'translate.partial': 'Recognizing',
  'translate.transcript': 'Transcript',
  'translate.empty': 'No phrases yet. Press "Start listening" and say something.',
  'translate.latency': 'Latency (ms)',
  'translate.stage.asr': 'ASR',
  'translate.stage.mt': 'MT',
  'translate.stage.tts': 'TTS playback',
  'translate.stage.e2e': 'End-to-end',
  'translate.unsupportedAsr': 'Speech recognition is not supported in this browser. Try Chrome or Edge.',
  'translate.unsupportedMt': 'Built-in translation is not available in this browser. Try Chrome or Edge.',
  'translate.unsupportedTts': 'Speech synthesis is not available; subtitles will work without dubbing.',
  'translate.back': 'Back to lobby',
  'translate.micHint': 'Allow microphone access when the browser asks.',
  'translate.dubbing': 'Speak the translation',
  'translate.metric.last': 'last',
  'translate.metric.p50': 'p50',
  'translate.metric.p90': 'p90',
  'translate.metric.count': 'samples',
  'manual.entry': 'Simple WebRTC call (temporary)',
  'manual.title': 'Simple WebRTC call',
  'manual.subtitle': 'No servers: exchange invite codes manually. Temporary transport for testing translation.',
  'manual.createOffer': 'Create invite code',
  'manual.join': 'Join with code',
  'manual.offerCode': 'Your invite code',
  'manual.answerCode': 'Answer code',
  'manual.pasteOffer': 'Paste invite code',
  'manual.pasteAnswer': 'Paste answer code',
  'manual.generateAnswer': 'Generate answer',
  'manual.connect': 'Connect',
  'manual.hintOffer': 'Send this code to the other participant, then paste their answer below.',
  'manual.hintAnswer': 'Send this answer code back to the caller.',
  'manual.hintPasteOffer': 'Ask the caller to copy their invite code here.',
  'manual.waiting': 'Waiting for connection…',
  'manual.connected': 'Connected',
  'manual.invalidCode': 'Invite or answer code is invalid',
  'manual.mediaError': 'Camera or microphone error',
  'manual.connectionError': 'Connection failed (NAT/firewall?)',
  'manual.mute': 'Mute microphone',
  'manual.unmute': 'Unmute microphone',
  'manual.cameraOn': 'Turn camera on',
  'manual.cameraOff': 'Turn camera off',
  'manual.hangup': 'Hang up',
  'manual.newCall': 'New call',
  'call.subtitles': 'Subtitles are on',
  'common.back': 'Back',
  'common.continue': 'Continue',
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
  'chat.subtitle': 'Создайте чат и поделитесь токеном или подключитесь по токену.',
  'chat.create': 'Создать чат',
  'chat.join': 'Подключиться по токену',
  'chat.token': 'Токен-приглашение',
  'chat.tokenPlaceholder': 'pnc1_…',
  'chat.shareLink': 'Ссылка-приглашение',
  'chat.shareHint': 'Отправьте ссылку или токен собеседнику.',
  'chat.newToken': 'Новый токен',
  'chat.waiting': 'Ждём собеседника…',
  'chat.tokenEmpty': 'Вставьте токен-приглашение',
  'chat.tokenInvalidPrefix': 'Токен должен начинаться с pnc1_',
  'chat.tokenInvalidPayload': 'Похоже, токен повреждён',
  'chat.copy': 'Копировать',
  'chat.copied': 'Скопировано',
  'devices.title': 'Камера и микрофон',
  'translate.entry': 'Живой перевод (демо)',
  'translate.title': 'Живой перевод',
  'translate.subtitle': 'Говорите в микрофон: смотрите субтитры и слушайте перевод.',
  'translate.prototype': 'Прототип: встроенные в браузер распознавание и перевод. Рекомендуется Chrome/Edge; возможны сервисы вендора. Локальные WASM-движки — следующий шаг.',
  'translate.start': 'Начать слушать',
  'translate.stop': 'Стоп',
  'translate.clear': 'Очистить',
  'translate.source': 'Я говорю на',
  'translate.target': 'Перевести на',
  'translate.swap': 'Поменять языки',
  'translate.listening': 'Слушаю…',
  'translate.translating': 'Перевожу…',
  'translate.speaking': 'Озвучиваю перевод…',
  'translate.idle': 'Ожидание',
  'translate.partial': 'Распознаю',
  'translate.transcript': 'Транскрипт',
  'translate.empty': 'Пока пусто. Нажмите «Начать слушать» и что-нибудь скажите.',
  'translate.latency': 'Задержка (мс)',
  'translate.stage.asr': 'ASR',
  'translate.stage.mt': 'Перевод',
  'translate.stage.tts': 'Озвучка',
  'translate.stage.e2e': 'Итого',
  'translate.unsupportedAsr': 'Распознавание речи не поддерживается этим браузером. Попробуйте Chrome или Edge.',
  'translate.unsupportedMt': 'Встроенный перевод недоступен в этом браузере. Попробуйте Chrome или Edge.',
  'translate.unsupportedTts': 'Синтез речи недоступен; субтитры будут работать без озвучки.',
  'translate.back': 'Назад в lobby',
  'translate.micHint': 'Разрешите доступ к микрофону, когда браузер спросит.',
  'translate.dubbing': 'Озвучивать перевод',
  'translate.metric.last': 'последняя',
  'translate.metric.p50': 'p50',
  'translate.metric.p90': 'p90',
  'translate.metric.count': 'замеров',
  'manual.entry': 'Простой WebRTC-звонок (временно)',
  'manual.title': 'Простой WebRTC-звонок',
  'manual.subtitle': 'Без серверов: обмен кодами вручную. Временный транспорт для тестирования перевода.',
  'manual.createOffer': 'Создать код-приглашение',
  'manual.join': 'Подключиться по коду',
  'manual.offerCode': 'Ваш код-приглашение',
  'manual.answerCode': 'Код-ответ',
  'manual.pasteOffer': 'Вставьте код-приглашение',
  'manual.pasteAnswer': 'Вставьте код-ответ',
  'manual.generateAnswer': 'Сгенерировать ответ',
  'manual.connect': 'Подключиться',
  'manual.hintOffer': 'Отправьте код собеседнику, затем вставьте его код-ответ ниже.',
  'manual.hintAnswer': 'Отправьте этот код-ответ обратно звонящему.',
  'manual.hintPasteOffer': 'Попросите звонящего скопировать сюда его код-приглашение.',
  'manual.waiting': 'Ждём соединения…',
  'manual.connected': 'Соединено',
  'manual.invalidCode': 'Код-приглашение или код-ответ некорректны',
  'manual.mediaError': 'Ошибка камеры или микрофона',
  'manual.connectionError': 'Не удалось соединиться (NAT/файрвол?)',
  'manual.mute': 'Выключить микрофон',
  'manual.unmute': 'Включить микрофон',
  'manual.cameraOn': 'Включить камеру',
  'manual.cameraOff': 'Выключить камеру',
  'manual.hangup': 'Завершить',
  'manual.newCall': 'Новый звонок',
  'call.subtitles': 'Субтитры включены',
  'common.back': 'Назад',
  'common.continue': 'Продолжить',
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

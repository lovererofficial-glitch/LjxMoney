import { appStorage } from '../lib/storage';
import { createLanguageStore } from './languageStore';

export const useLanguageStore = createLanguageStore(appStorage);

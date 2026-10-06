import AsyncStorage from '@react-native-async-storage/async-storage';

import { createLanguageStore } from './languageStore';

export const useLanguageStore = createLanguageStore(AsyncStorage);

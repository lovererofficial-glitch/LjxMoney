import AsyncStorage from '@react-native-async-storage/async-storage';

import { createSerializedStorage } from './serializedStorage';

export const appStorage = createSerializedStorage(AsyncStorage);

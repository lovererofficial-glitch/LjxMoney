import { Linking } from 'react-native';

const addEventListener = Linking.addEventListener.bind(Linking);

Linking.addEventListener = (eventType, listener) => {
  if (eventType === 'url') {
    return { remove: () => {} } as ReturnType<typeof Linking.addEventListener>;
  }

  return addEventListener(eventType, listener);
};

require('expo-router/entry');

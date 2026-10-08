import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

export default function WalletDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  useEffect(() => {
    if (id) {
      router.replace(`/wallets/${id}`);
    }
  }, [id]);

  return null;
}

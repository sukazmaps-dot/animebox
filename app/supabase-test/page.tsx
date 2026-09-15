'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function SupabaseTestPage() {
  const [message, setMessage] = useState('Проверяем соединение...');

  useEffect(() => {
    async function testConnection() {
      const supabase = createClient();

      const { error } = await supabase
        .from('anime')
        .select('id')
        .limit(1);

      if (error) {
        console.error(error);
        setMessage(`Ошибка: ${error.message}`);
        return;
      }

      setMessage('Supabase подключён успешно ✅');
    }

    testConnection();
  }, []);

  return (
    <main style={{ padding: 40 }}>
      <h1>Supabase Test</h1>
      <p>{message}</p>
    </main>
  );
}
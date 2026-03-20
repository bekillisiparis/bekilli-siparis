import { useState } from 'react';

export default function App() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const testApi = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/siparis');
      const data = await res.json();
      setStatus({ ok: res.ok, data });
    } catch (err) {
      setStatus({ ok: false, data: { hata: err.message } });
    }
    setLoading(false);
  };

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', maxWidth: 480, margin: '80px auto', textAlign: 'center', padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>📦 Bekilli Sipariş</h1>
      <p style={{ color: '#888', marginBottom: 32 }}>Sistem kuruluyor...</p>

      <button
        onClick={testApi}
        disabled={loading}
        style={{
          padding: '12px 28px', fontSize: 15, fontWeight: 600,
          background: '#007AFF', color: '#fff', border: 'none',
          borderRadius: 10, cursor: 'pointer', opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? 'Test ediliyor...' : '🔌 API Bağlantı Testi'}
      </button>

      {status && (
        <pre style={{
          marginTop: 24, padding: 16, borderRadius: 10, fontSize: 13, textAlign: 'left',
          background: status.ok ? '#e8f5e9' : '#fce4ec',
          color: status.ok ? '#2e7d32' : '#c62828',
          overflowX: 'auto',
        }}>
          {JSON.stringify(status.data, null, 2)}
        </pre>
      )}
    </div>
  );
}

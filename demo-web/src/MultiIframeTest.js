import React from 'react';

const FRAME_COUNT = 120;

export default function MultiIframeTest() {
  const frames = Array.from({ length: FRAME_COUNT }, (_, i) => i + 1);
  return (
    <div style={{ padding: '1rem', overflow: 'auto' }}>
      <h1>Multi‑Iframe PHP CGI Test</h1>
      <p>
        This test mounts {FRAME_COUNT} simultaneous iframes pointing at a simple PHP page
        served by the CGI service worker.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
        {frames.map(i => (
          <iframe
            key={i}
            src={`/php-wasm/cgi-bin/test?frame=${i}`}
            width="300"
            height="150"
            title={`PHP iframe ${i}`}
            style={{ border: '1px solid #444' }}
          />
        ))}
      </div>
    </div>
  );
}
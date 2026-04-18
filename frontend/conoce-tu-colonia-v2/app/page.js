'use client';

import { useEffect, useState } from 'react';
import { IOSDevice } from '../components/IOSDevice';
import { CTCApp } from '../components/CTCApp';

export default function Page() {
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [frameHeight, setFrameHeight] = useState(874);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia('(min-width: 500px)');
    const update = () => {
      setIsDesktop(mq.matches);
      setFrameHeight(Math.min(874, window.innerHeight - 48));
    };
    update();
    mq.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      mq.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  if (!mounted) {
    return <div style={{ width: '100%', height: '100vh' }} />;
  }

  if (isDesktop) {
    return (
      <div
        style={{
          width: '100%',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <IOSDevice dark width={402} height={frameHeight}>
          <div style={{ width: '100%', height: '100%' }}>
            <CTCApp />
          </div>
        </IOSDevice>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <CTCApp />
    </div>
  );
}

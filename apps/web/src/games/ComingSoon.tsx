import { useNavigate } from 'react-router-dom';
import { Card, Button, BackLink } from '@ui/index';

export function ComingSoon({ label }: { label: string }) {
  const nav = useNavigate();
  return (
    <Card>
      <BackLink onClick={() => nav('/')} />
      <div className="hg-eyebrow">Jestr</div>
      <h2 style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>{label} is on the way</h2>
      <p className="hg-note">This game hasn't landed yet, check back soon.</p>
      <Button onClick={() => nav('/')}>Back to all games</Button>
    </Card>
  );
}

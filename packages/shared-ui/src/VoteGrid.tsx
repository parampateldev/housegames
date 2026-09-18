export function VoteGrid<T extends { id: string; name: string }>({
  players, selectedId, onVote, disabledIds = [],
}: {
  players: T[];
  selectedId?: string;
  onVote: (id: string) => void;
  disabledIds?: string[];
}) {
  return (
    <div className="hg-vote-grid">
      {players.map((p) => (
        <button
          key={p.id}
          type="button"
          className={'hg-btn' + (selectedId === p.id ? '' : ' hg-ghost')}
          disabled={disabledIds.includes(p.id)}
          onClick={() => onVote(p.id)}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}

interface OverallGraceProps {
  message: string;
}

export function OverallGrace({ message }: OverallGraceProps) {
  return (
    <div className="bg-bg1 border-accent rounded-lg border-l-2 p-4">
      <div className="mb-2 flex items-center gap-2">
        <i className="bi-sun text-accent icon-md" />
        <span className="text-fg1 font-medium">Guidance of Grace</span>
      </div>
      <p className="text-fg2 leading-relaxed italic">"{message}"</p>
    </div>
  );
}

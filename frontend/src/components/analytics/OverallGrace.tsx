interface OverallGraceProps {
  message: string;
}

export function OverallGrace({ message }: OverallGraceProps) {
  return (
    <div className="bg-bg1 rounded-lg p-4 border-l-2 border-accent">
      <div className="flex items-center gap-2 mb-2">
        <i className="bi-sun text-accent icon-md" />
        <span className="text-fg1 font-medium">Guidance of Grace</span>
      </div>
      <p className="text-fg2 italic leading-relaxed">"{message}"</p>
    </div>
  );
}

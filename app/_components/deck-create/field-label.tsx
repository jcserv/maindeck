import { EYEBROW_CLASS } from "@/components/ui/eyebrow";

export function FieldLabel({
  htmlFor,
  children,
  optional,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  optional?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between mb-2">
      <label htmlFor={htmlFor} className={EYEBROW_CLASS}>
        {children}
        {optional && (
          <span className="ml-1.5 text-[10px] normal-case tracking-normal text-muted-foreground/60 font-normal">
            optional
          </span>
        )}
      </label>
    </div>
  );
}

import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "cn";

const components: Components = {
  // 문단·목록은 사이 여백만 주고 첫/마지막은 죽인다 — 버블 패딩과 겹치지 않게.
  p: (p) => <p className="my-3 first:mt-0 last:mb-0" {...p} />,
  ul: (p) => (
    <ul className="my-3 list-disc space-y-1 pl-5 first:mt-0 last:mb-0" {...p} />
  ),
  ol: (p) => (
    <ol
      className="my-3 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0"
      {...p}
    />
  ),

  h1: (p) => (
    <h1 className="mt-5 mb-2 text-lg font-semibold first:mt-0" {...p} />
  ),
  h2: (p) => (
    <h2 className="mt-5 mb-2 text-base font-semibold first:mt-0" {...p} />
  ),
  h3: (p) => (
    <h3 className="mt-4 mb-1.5 text-[15px] font-semibold first:mt-0" {...p} />
  ),

  a: (p) => (
    <a
      target="_blank"
      rel="noreferrer"
      className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
      {...p}
    />
  ),
  blockquote: (p) => (
    <blockquote
      className="my-3 border-l-2 border-border pl-3 text-muted-foreground"
      {...p}
    />
  ),
  hr: (p) => <hr className="my-4 border-border" {...p} />,

  // 인라인 코드와 코드블록을 가른다. 코드블록의 <code> 에는 language-* 클래스가
  // 붙고 <pre> 안에 들어간다 — 그 경우엔 배경을 pre 가 그리므로 여기선 비운다.
  code: ({ className, ...p }) =>
    /language-/.test(className ?? "") ? (
      <code
        className={cn("font-mono text-[13px] leading-relaxed", className)}
        {...p}
      />
    ) : (
      <code
        className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[13px]"
        {...p}
      />
    ),
  // 긴 줄은 버블을 늘리지 않고 자기 안에서 가로 스크롤한다.
  pre: (p) => (
    <pre
      className="my-3 overflow-x-auto rounded-xl border border-border bg-muted/60 p-3 first:mt-0 last:mb-0"
      {...p}
    />
  ),

  table: (p) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...p} />
    </div>
  ),
  th: (p) => (
    <th
      className="border border-border bg-muted/50 px-2.5 py-1.5 text-left font-medium"
      {...p}
    />
  ),
  td: (p) => <td className="border border-border px-2.5 py-1.5" {...p} />,
};

type Props = {
  text: string;
};

export const MarkdownText = ({ text }: Readonly<Props>) => {
  return (
    <div className="text-[15px] leading-relaxed wrap-break-word">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </Markdown>
    </div>
  );
};

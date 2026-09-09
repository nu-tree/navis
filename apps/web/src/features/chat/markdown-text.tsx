import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "cn";

// 마크다운 렌더러.
//
// 옛 Expo 앱은 손으로 만든 무의존 렌더러를 썼다 — RN 에서 md 라이브러리를 감당할 수
// 없었기 때문이다. 브라우저에는 그 제약이 없으니 제대로 된 렌더러를 쓴다.
// (문법 하이라이팅은 아직 넣지 않았다 — shiki/prism 은 무거워서 실제로 코드가 자주
//  오는지 보고 결정하는 게 낫다. 지금은 스타일링된 <pre> 로 충분히 읽힌다.)
//
// 스타일은 Tailwind Typography 대신 직접 지정한다. 채팅 버블은 문서가 아니라
// 대화라서 prose 의 여백 스케일이 과하다.

type CodeProps = ComponentPropsWithoutRef<"code"> & { inline?: boolean };

export function MarkdownText({ text }: { text: string }) {
  return (
    <div className="text-[15px] leading-relaxed wrap-break-word">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 문단 사이 여백만 주고 첫/마지막은 죽인다 — 버블 패딩과 겹치지 않게.
          p: ({ children }) => (
            <p className="my-3 first:mt-0 last:mb-0">{children}</p>
          ),
          h1: ({ children }) => (
            <h1 className="mt-5 mb-2 text-lg font-semibold first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-5 mb-2 text-base font-semibold first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-4 mb-1.5 text-[15px] font-semibold first:mt-0">
              {children}
            </h3>
          ),
          ul: ({ children }) => (
            <ul className="my-3 list-disc space-y-1 pl-5 first:mt-0 last:mb-0">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-3 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0">
              {children}
            </ol>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-border pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-border" />,
          code: ({ inline, className, children, ...props }: CodeProps) => {
            // 인라인 코드와 코드블록을 구분한다. react-markdown 은 코드블록의
            // <code> 에 language-* 클래스를 붙이고, pre 안에 넣는다.
            const isBlock = !inline && /language-/.test(className ?? "");
            if (isBlock) {
              return (
                <code
                  className={cn(
                    "font-mono text-[13px] leading-relaxed",
                    className,
                  )}
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[13px]"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            // 긴 줄은 버블을 늘리지 않고 자기 안에서 가로 스크롤한다.
            <pre className="my-3 overflow-x-auto rounded-xl border border-border bg-muted/60 p-3 first:mt-0 last:mb-0">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-muted/50 px-2.5 py-1.5 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-2.5 py-1.5">{children}</td>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}

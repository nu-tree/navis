import { Fragment, type ReactNode } from 'react';
import { Linking, View } from 'react-native';
import { cn } from '../../lib/cn';
import { Text } from '../ui/text';

// 가벼운 마크다운 렌더러 — navis 보고/응답이 마크다운으로 오는데 평문으로 보이던 걸
// 실제 서식으로 그린다. 의존성 없이(React 19/RN 0.83 호환 안전) 흔한 요소만 처리:
// 헤더(#~######) · 굵게(**) · 기울임(*,_) · 인라인 코드(`) · 코드블록(```) · 링크([]())
// · 글머리/번호 리스트 · 인용(>) · 구분선(---) · 표(GFM 파이프). 중첩리스트는 평문.
// className 으로 본문 색(예: text-card-foreground)을 받아 모든 텍스트에 상속시킨다.

// 한 줄(또는 단락) 안의 인라인 서식을 Text 조각으로.
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // 순서 주의: **굵게** 를 *기울임* 보다 먼저 매칭. 마크다운 링크는 평문 URL 자동링크
  // 보다 먼저 — `[txt](http://...)` 의 url 부분을 평문 URL 로 이중 매칭하지 않게.
  // 밑줄(_) 기울임은 일부러 빼둔다 — CLAUDE_CODE_OAUTH_TOKEN 같은 snake_case 식별자의
  // 밑줄이 기울임으로 오인돼 글자가 깨지기 때문. 기울임은 *별표*만 지원한다.
  const re = /(\*\*([^*\n]+)\*\*|`([^`\n]+)`|\*([^*\n]+)\*|\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>]+))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(<Fragment key={`${keyPrefix}t${i}`}>{text.slice(last, m.index)}</Fragment>);
    if (m[2] != null) {
      nodes.push(<Text key={`${keyPrefix}b${i}`} className="font-bold">{m[2]}</Text>);
    } else if (m[3] != null) {
      nodes.push(
        <Text key={`${keyPrefix}c${i}`} className="rounded bg-secondary px-1 font-mono text-[13px]">
          {m[3]}
        </Text>,
      );
    } else if (m[4] != null) {
      nodes.push(<Text key={`${keyPrefix}i${i}`} className="italic">{m[4]}</Text>);
    } else if (m[5] != null) {
      const url = m[6];
      nodes.push(
        <Text
          key={`${keyPrefix}l${i}`}
          className="text-primary underline"
          onPress={() => void Linking.openURL(url).catch(() => {})}
        >
          {m[5]}
        </Text>,
      );
    } else if (m[7] != null) {
      // 평문 URL — 끝에 붙은 문장부호는 URL에서 떼어내 본문 텍스트로 되돌린다.
      // ) 는 URL 경로에 자주 들어가므로(예: Wikipedia) URL 안에 ( 가 있으면 보존.
      let url = m[7];
      const trailRe = url.includes('(') ? /[.,;:!?\]}'"]+$/ : /[.,;:!?)\]}'"]+$/;
      const trailMatch = trailRe.exec(url);
      const trailing = trailMatch ? trailMatch[0] : '';
      if (trailing) url = url.slice(0, url.length - trailing.length);
      const href = url;
      nodes.push(
        <Text
          key={`${keyPrefix}u${i}`}
          className="text-primary underline"
          onPress={() => void Linking.openURL(href).catch(() => {})}
        >
          {url}
        </Text>,
      );
      if (trailing) nodes.push(<Fragment key={`${keyPrefix}ut${i}`}>{trailing}</Fragment>);
    }
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) nodes.push(<Fragment key={`${keyPrefix}t${i}`}>{text.slice(last)}</Fragment>);
  return nodes;
}

// 표 한 줄을 셀 배열로. 양끝 파이프는 버리고 내부 파이프로 나눈다.
function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

// |---|:--:| 형태의 표 구분선인지 — 모든 셀이 :?-+:? 꼴이어야 한다.
function isTableSeparator(line: string): boolean {
  if (!line.includes('|') && !/^\s*:?-+:?\s*$/.test(line)) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c) || /^:?-+:?$/.test(c));
}

// 다음 블록 시작을 알리는 줄인지(단락 수집 종료 판단용). 표 시작(|)도 포함 —
// 단락 바로 다음 줄에 붙은 표가 단락에 삼켜지지 않게.
const BLOCK_START = /^(#{1,6}\s|```|\s*([-*+]|\d+\.)\s|\s*>|\s*([-*_])\3\3|\s*\|)/;

export function MarkdownText({ text, className }: { text: string; className?: string }) {
  const base = cn('text-[15px] leading-5', className);
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 코드블록 ```
    if (line.trimStart().startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        buf.push(lines[i]);
        i++;
      }
      i++; // 닫는 펜스 스킵
      blocks.push(
        <View key={key++} className="my-1 rounded-lg bg-secondary px-3 py-2">
          <Text selectable className={cn('font-mono text-[13px] leading-5', className)}>
            {buf.join('\n')}
          </Text>
        </View>,
      );
      continue;
    }

    // 빈 줄
    if (line.trim() === '') {
      i++;
      continue;
    }

    // 헤더
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const size =
        level <= 1 ? 'text-lg font-bold' : level === 2 ? 'text-base font-bold' : 'text-[15px] font-semibold';
      blocks.push(
        <Text key={key} selectable className={cn(size, 'mb-0.5 mt-1.5', className)}>
          {renderInline(h[2], `h${key++}`)}
        </Text>,
      );
      i++;
      continue;
    }

    // 구분선 --- *** ___
    if (/^\s*([-*_])\1\1+\s*$/.test(line)) {
      blocks.push(<View key={key++} className="my-2 h-px bg-border" />);
      i++;
      continue;
    }

    // 인용 >
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push(
        <View key={key} className="my-1 border-l-2 border-border pl-3">
          <Text selectable className={cn('text-[15px] leading-5 text-muted-foreground')}>
            {renderInline(buf.join('\n'), `q${key++}`)}
          </Text>
        </View>,
      );
      continue;
    }

    // 표 — 헤더 | 셀 | + 구분선 |---|. 클로드 데스크톱처럼 테두리 있는 그리드로.
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1]) &&
      splitRow(line).length > 1
    ) {
      const header = splitRow(line);
      const cols = header.length;
      i += 2; // 헤더 + 구분선 소비
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        const cells = splitRow(lines[i]);
        // 열 수 정규화 — 모자라면 빈 칸, 넘치면 자름(깨진 행으로 전체가 무너지지 않게)
        rows.push(Array.from({ length: cols }, (_, c) => cells[c] ?? ''));
        i++;
      }
      const cellText = cn('text-[13px] leading-5', className);
      blocks.push(
        <View key={key++} className="my-1.5 overflow-hidden rounded-lg border border-border">
          <View className="flex-row bg-secondary/80">
            {header.map((cell, c) => (
              <View
                key={`th${c}`}
                className={cn('flex-1 px-2.5 py-1.5', c > 0 && 'border-l border-border')}
              >
                <Text selectable className={cn(cellText, 'font-semibold')}>
                  {renderInline(cell, `th${key}_${c}`)}
                </Text>
              </View>
            ))}
          </View>
          {rows.map((cells, r) => (
            <View key={`tr${r}`} className="flex-row border-t border-border">
              {cells.map((cell, c) => (
                <View
                  key={`td${r}_${c}`}
                  className={cn('flex-1 px-2.5 py-1.5', c > 0 && 'border-l border-border')}
                >
                  <Text selectable className={cellText}>
                    {renderInline(cell, `td${key}_${r}_${c}`)}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>,
      );
      continue;
    }

    // 리스트(글머리/번호) — 연속 항목 묶음
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        const mm = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(lines[i])!;
        const bullet = /\d+\./.test(mm[1]) ? mm[1] : '•';
        items.push(
          <View key={`li${i}`} className="flex-row gap-2">
            <Text selectable className={base}>{bullet}</Text>
            <Text selectable className={cn(base, 'flex-1')}>{renderInline(mm[2], `li${i}`)}</Text>
          </View>,
        );
        i++;
      }
      blocks.push(
        <View key={key++} className="my-0.5 gap-0.5">
          {items}
        </View>,
      );
      continue;
    }

    // 단락 — 다음 블록 전까지 연속 줄을 묶는다.
    const buf: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== '' && !BLOCK_START.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push(
      <Text key={key} selectable className={base}>
        {renderInline(buf.join('\n'), `p${key++}`)}
      </Text>,
    );
  }

  return <View className="gap-1">{blocks}</View>;
}

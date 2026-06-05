import { useMemo, type ReactNode } from 'react';
import { PanResponder, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

// 의존성 없는 드래그 정렬 리스트(짧은 목록용). react-native-gesture-handler 없이
// RN 코어 PanResponder + reanimated shared value 로만 동작 → 새 네이티브 모듈 불필요.
// 드래그 중에는 setState 를 쓰지 않아(shared value 만 갱신) 제스처가 끊기지 않는다.
// 드래그한 행은 손가락을 따라 떠오르고, 놓으면 itemHeight 기준으로 가장 가까운 슬롯에 안착.
// (드래그 도중 다른 행이 실시간으로 비켜주진 않는 단순형 — 짧은 사이드바 목록엔 충분.)

export type DraggableRowsProps<T> = {
  items: T[];
  keyOf: (item: T) => string;
  itemHeight: number;
  // 드래그 핸들을 붙일 props 를 받아 행을 그린다. 핸들 영역에 {...handle} 를 펼친다.
  renderRow: (item: T, handle: object, index: number) => ReactNode;
  // 놓았을 때 새 순서(id 배열). 변경 없으면 호출 안 함.
  onReorder: (orderedIds: string[]) => void;
};

export function DraggableRows<T>({
  items,
  keyOf,
  itemHeight,
  renderRow,
  onReorder,
}: DraggableRowsProps<T>) {
  // 드래그 상태(React 리렌더 없이 UI 스레드에서만 읽음)
  const activeIndex = useSharedValue(-1);
  const dragY = useSharedValue(0);

  // 최신 items 를 클로저 갱신 없이 참조하기 위한 셀렉터
  const ids = items.map(keyOf);

  // 행마다 PanResponder. itemHeight·길이가 바뀌면 새로 만든다.
  const responders = useMemo(
    () =>
      items.map((_, index) =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 2,
          onPanResponderGrant: () => {
            activeIndex.value = index;
            dragY.value = 0;
          },
          onPanResponderMove: (_e, g) => {
            dragY.value = g.dy;
          },
          onPanResponderRelease: (_e, g) => {
            const n = ids.length;
            const target = Math.max(
              0,
              Math.min(n - 1, index + Math.round(g.dy / itemHeight)),
            );
            if (target !== index) {
              const order = [...ids];
              const [m] = order.splice(index, 1);
              order.splice(target, 0, m);
              onReorder(order);
            }
            activeIndex.value = -1;
            dragY.value = 0;
          },
          onPanResponderTerminate: () => {
            activeIndex.value = -1;
            dragY.value = 0;
          },
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items.length, itemHeight, ids.join(',')],
  );

  return (
    <View>
      {items.map((item, index) => (
        <DragRow
          key={keyOf(item)}
          index={index}
          itemHeight={itemHeight}
          activeIndex={activeIndex}
          dragY={dragY}
        >
          {renderRow(item, responders[index].panHandlers, index)}
        </DragRow>
      ))}
    </View>
  );
}

function DragRow({
  index,
  itemHeight,
  activeIndex,
  dragY,
  children,
}: {
  index: number;
  itemHeight: number;
  activeIndex: { value: number };
  dragY: { value: number };
  children: ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const lifted = activeIndex.value === index;
    return {
      transform: [{ translateY: lifted ? dragY.value : 0 }],
      zIndex: lifted ? 999 : 0,
      // 드래그 중인 행은 살짝 떠 보이게
      opacity: lifted ? 0.95 : 1,
    };
  });

  return (
    <Animated.View style={[{ height: itemHeight }, style]}>{children}</Animated.View>
  );
}

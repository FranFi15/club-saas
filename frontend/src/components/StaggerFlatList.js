import React, { useCallback } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import StaggerEnter from './StaggerEnter';
import { useEntranceEpoch } from '../hooks/useEntranceEpoch';

/**
 * FlatList that staggers row entrance (opacity + translateY by index), Gain-style.
 * Multi-column grids keep equal cell widths via flex on the entrance wrapper.
 */
export default function StaggerFlatList({
  staggerEpoch,
  staggerKeyExtractor,
  renderItem,
  numColumns,
  ...rest
}) {
  const epoch = useEntranceEpoch(staggerEpoch || 'list');
  const multiCol = (numColumns || 1) > 1;

  const wrappedRenderItem = useCallback(
    (info) => {
      const { item, index } = info;
      const id =
        (typeof staggerKeyExtractor === 'function' && staggerKeyExtractor(item, index)) ||
        item?._id ||
        item?.id ||
        item?.key ||
        index;
      return (
        <StaggerEnter
          index={index}
          token={`${epoch}:${id}`}
          style={multiCol ? styles.cell : undefined}
        >
          {renderItem(info)}
        </StaggerEnter>
      );
    },
    [epoch, multiCol, renderItem, staggerKeyExtractor],
  );

  return <FlatList {...rest} numColumns={numColumns} renderItem={wrappedRenderItem} />;
}

const styles = StyleSheet.create({
  cell: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
  },
});

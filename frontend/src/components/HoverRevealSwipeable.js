import React, {
  useRef,
  useImperativeHandle,
  forwardRef,
  isValidElement,
  Children,
} from 'react';
import { Platform, StyleSheet, View, TouchableOpacity, Pressable } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

const WEB_ACTION_PAD = 52;

function withWebActionPadding(child) {
  if (!isValidElement(child)) return child;

  const props = child.props || {};
  if (props.contentStyle != null || 'contentStyle' in props || props.footer !== undefined) {
    return React.cloneElement(child, {
      contentStyle: [props.contentStyle, { paddingRight: WEB_ACTION_PAD }],
    });
  }

  return React.cloneElement(child, {
    style: [props.style, { paddingRight: WEB_ACTION_PAD }],
  });
}

function isPressableType(type) {
  return type === TouchableOpacity || type === Pressable;
}

/** Pull TouchableOpacity / Pressable leaves out of swipe action trees. */
function collectActionButtons(node, acc = []) {
  if (node == null || node === false) return acc;
  if (Array.isArray(node)) {
    node.forEach((n) => collectActionButtons(n, acc));
    return acc;
  }
  if (!isValidElement(node)) return acc;

  if (isPressableType(node.type)) {
    acc.push(node);
    return acc;
  }

  Children.forEach(node.props?.children, (child) => collectActionButtons(child, acc));
  return acc;
}

function isDestructiveColor(color) {
  const c = String(color || '').toLowerCase();
  return c === '#ef4444' || c === '#dc2626' || c.includes('ef4444');
}

function isEditAmberColor(color) {
  const c = String(color || '').toLowerCase();
  return (
    c === '#f59e0b' ||
    c === '#eab308' ||
    c === '#fbbf24' ||
    c === '#d97706' ||
    c.includes('f59e0b')
  );
}

function iconOnlyChild(children) {
  const list = Children.toArray(children);
  const icon = list.find(
    (c) =>
      isValidElement(c) &&
      (c.props?.name != null || String(c.type?.displayName || c.type?.name || '').includes('Icon')),
  );
  if (!icon) return children;

  const name = String(icon.props.name || '');
  const destructive = name.includes('trash') || name.includes('close') || name.includes('ban');
  const nextName = name === 'trash' ? 'trash-outline' : name;

  return React.cloneElement(icon, {
    name: nextName,
    size: 18,
    color: '#fff',
  });
}

/** Restyle swipe actions like CoachCourtMetrics: stacked 34×34 icon buttons. */
function WebStackedActions({ actions }) {
  const buttons = collectActionButtons(actions);
  if (!buttons.length) return null;

  return (
    <View style={styles.webActionsCol}>
      {buttons.map((btn, index) => {
        const flat = StyleSheet.flatten(btn.props.style) || {};
        const bg = flat.backgroundColor;
        const destructive = isDestructiveColor(bg);
        const editAmber = isEditAmberColor(bg);
        return React.cloneElement(btn, {
          key: btn.key || `web-action-${index}`,
          activeOpacity: btn.props.activeOpacity ?? 0.85,
          hitSlop: btn.props.hitSlop ?? 8,
          style: [
            styles.webIconBtn,
            {
              backgroundColor: destructive ? '#ef4444' : editAmber ? '#6b7280' : bg || '#6b7280',
              marginTop: index > 0 ? 6 : 0,
            },
          ],
          children: iconOnlyChild(btn.props.children),
        });
      })}
    </View>
  );
}

/**
 * Native: swipeable row with right/left actions.
 * Web: stacked icon buttons inside the card (same pattern as métricas en cancha).
 */
const HoverRevealSwipeable = forwardRef(function HoverRevealSwipeable(
  {
    children,
    enabled = true,
    renderRightActions,
    renderLeftActions,
    ...swipeableProps
  },
  ref,
) {
  const swipeRef = useRef(null);
  const isWeb = Platform.OS === 'web';

  useImperativeHandle(ref, () => ({
    close: () => swipeRef.current?.close?.(),
    openRight: () => {
      if (isWeb) return;
      swipeRef.current?.openRight?.();
    },
    openLeft: () => {
      if (isWeb) return;
      swipeRef.current?.openLeft?.();
    },
    reset: () => swipeRef.current?.reset?.(),
  }));

  if (isWeb) {
    const right = enabled && typeof renderRightActions === 'function' ? renderRightActions() : null;
    const left = enabled && typeof renderLeftActions === 'function' ? renderLeftActions() : null;

    if (!right && !left) {
      return children;
    }

    const padded = Children.map(children, withWebActionPadding);

    return (
      <View style={styles.webWrap}>
        {padded}
        <View style={styles.webActionsInCard} pointerEvents="box-none">
          {left ? <WebStackedActions actions={left} /> : null}
          {right ? <WebStackedActions actions={right} /> : null}
        </View>
      </View>
    );
  }

  return (
    <Swipeable
      ref={swipeRef}
      enabled={enabled}
      renderRightActions={renderRightActions}
      renderLeftActions={renderLeftActions}
      {...swipeableProps}
    >
      {children}
    </Swipeable>
  );
});

const styles = StyleSheet.create({
  webWrap: {
    position: 'relative',
  },
  webActionsInCard: {
    position: 'absolute',
    right: 12,
    top: 12,
    zIndex: 10,
  },
  webActionsCol: {
    alignItems: 'center',
  },
  webIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default HoverRevealSwipeable;

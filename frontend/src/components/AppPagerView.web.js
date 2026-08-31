import React, { Children, forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { View } from 'react-native';

/**
 * Web stand-in for PagerView: renders only the active page, since there is no
 * horizontal swipe on web. `initialPage` is treated as the current page so the
 * screen stays in sync whether it drives the pager by prop or by ref.
 */
const AppPagerView = forwardRef(function AppPagerView(
  { initialPage = 0, onPageSelected, style, children, ...rest },
  ref,
) {
  const [page, setPage] = useState(initialPage);

  useEffect(() => {
    setPage(initialPage);
  }, [initialPage]);

  useImperativeHandle(
    ref,
    () => ({
      setPage,
      setPageWithoutAnimation: setPage,
      setScrollEnabled: () => {},
    }),
    [],
  );

  const pages = Children.toArray(children);
  const index = Math.min(Math.max(page, 0), Math.max(pages.length - 1, 0));

  return (
    <View style={style} {...rest}>
      {pages[index] ?? null}
    </View>
  );
});

export default AppPagerView;

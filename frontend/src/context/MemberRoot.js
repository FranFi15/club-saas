import React, { useContext } from 'react';
import { ClubContext } from './ClubContext';
import { MemberProvider } from './MemberContext';

/** Siempre envuelve con MemberProvider para no remontar AppNavigator al activar atleta/tutor. */
export default function MemberRoot({ children }) {
  const { memberSessionRol } = useContext(ClubContext);
  const mode =
    memberSessionRol === 'atleta' || memberSessionRol === 'tutor' ? memberSessionRol : null;

  return <MemberProvider mode={mode}>{children}</MemberProvider>;
}

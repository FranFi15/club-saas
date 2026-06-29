import React, { useContext } from 'react';
import { ClubContext } from './ClubContext';
import { MemberProvider } from './MemberContext';

/** Envuelve la app con MemberProvider cuando la sesión es atleta o tutor. */
export default function MemberRoot({ children }) {
  const { memberSessionRol } = useContext(ClubContext);

  if (memberSessionRol === 'atleta') {
    return <MemberProvider mode="atleta">{children}</MemberProvider>;
  }
  if (memberSessionRol === 'tutor') {
    return <MemberProvider mode="tutor">{children}</MemberProvider>;
  }

  return children;
}

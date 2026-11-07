import { StyleSheet } from 'react-native';
import { useAdminDesktopLayout } from '../../../hooks/useAdminDesktopLayout';
import { padCatalogData, isCatalogSpacer } from '../adminCatalog';

export { padCatalogData, isCatalogSpacer };

/** Columnas del catálogo Finanzas en escritorio (Familias usa 2). */
export function useFinanzasCatalogColumns(family = false) {
  const { isDesktop } = useAdminDesktopLayout();
  if (!isDesktop) return 1;
  return family ? 2 : 3;
}

export const finanzasCatalogStyles = StyleSheet.create({
  row: {
    gap: 12,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },
  cell: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
  },
  cell2: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
  },
  fill: {
    flex: 1,
  },
  /** Usuarios (pagos) — filas compactas de altura fija */
  cardAthlete: {
    marginBottom: 12,
    width: '100%',
    flex: 1,
    height: 118,
  },
  /** Nómina / Gastos / Sponsors — misma altura base; la fila estira al más alto */
  card3: {
    marginBottom: 12,
    width: '100%',
    flex: 1,
    minHeight: 152,
  },
  /** Familias: 2 por fila */
  card2: {
    marginBottom: 12,
    width: '100%',
    flex: 1,
    minHeight: 180,
  },
  metaSlot: {
    minHeight: 18,
    justifyContent: 'flex-start',
  },
  notesSlot: {
    minHeight: 34,
    justifyContent: 'flex-start',
  },
});

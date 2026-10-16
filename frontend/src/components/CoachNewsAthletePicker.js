import React from 'react';
import NewsMultiSelectList from './NewsMultiSelectList';
import { formatUserName } from '../utils/listSort';

/** Selector de atletas para noticias del profesor (multi-select + búsqueda). */
export default function CoachNewsAthletePicker({
  athletes = [],
  categories = [],
  selectedIds = [],
  onToggle,
  onSetSelected,
  theme,
  colorMarca,
  singleSelect = false,
}) {
  return (
    <NewsMultiSelectList
      items={athletes}
      selectedIds={selectedIds}
      onToggle={onToggle}
      onSetSelected={onSetSelected}
      theme={theme}
      colorMarca={colorMarca}
      singleSelect={singleSelect}
      searchLabel="Buscar jugador"
      searchPlaceholder="Escribí nombre o apellido…"
      filterOptions={categories.map((c) => ({ id: c._id, label: c.nombre }))}
      getItemFilterIds={(a) => a.categoriaIds || []}
      getPrimaryLabel={(a) => formatUserName(a)}
      getSecondaryLabel={(a) => a.categoriasLabel || null}
      getSearchText={(a) => `${formatUserName(a)} ${a.categoriasLabel || ''}`}
      emptyListHint="No hay atletas activos en tus categorías."
      emptySearchHint="Ningún atleta coincide con la búsqueda."
    />
  );
}

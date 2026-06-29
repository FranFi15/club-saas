import React from 'react';

export default function ClubTable({ clubs, handleStatusChange, handleEditClick, handleDelete }) {
  const getStatusColor = (status) => {
    const colors = {
      activo: 'bg-green-100 text-green-800 border-green-200',
      periodo_prueba: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      inactivo: 'bg-gray-100 text-gray-800 border-gray-200',
      vencido: 'bg-red-100 text-red-800 border-red-200',
      cancelado: 'bg-red-100 text-red-800 border-red-200'
    };
    return colors[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  return (
    <div className="overflow-hidden bg-white rounded-lg shadow">
      <table className="min-w-full text-left">
        <thead className="text-white bg-gray-800">
          <tr>
            <th className="p-4">Logo</th>
            <th className="p-4">Color</th>
            <th className="p-4">Nombre</th>
            <th className="p-4">Identifier</th>
            <th className="p-4 text-center">Estado</th>
            <th className="p-4 text-center">Atletas</th>
            <th className="p-4 text-center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {clubs.map((club) => (
            <tr key={club._id} className="transition border-b hover:bg-gray-50">
              <td className="p-4">
                {club.logoUrl ? (
                  <img src={club.logoUrl} alt="Logo" className="object-cover w-10 h-10 rounded-full shadow-sm" />
                ) : (
                  <div className="flex items-center justify-center w-10 h-10 text-xs font-bold text-gray-500 bg-gray-200 rounded-full shadow-sm">N/A</div>
                )}
              </td>
              <td className="p-4">
                <div 
                  className="w-8 h-8 border border-gray-200 rounded-full shadow-sm" 
                  style={{ backgroundColor: club.primaryColor }}
                  title={club.primaryColor}
                ></div>
              </td>
              <td className="p-4 font-semibold text-gray-800">{club.nombre}</td>
              <td className="p-4 text-sm text-gray-500">{club.urlIdentifier}</td>
              
              <td className="p-4 text-center">
                <select 
                  value={club.estadoSuscripcion}
                  onChange={(e) => handleStatusChange(club._id, e.target.value)}
                  className={`px-2 py-1 text-xs font-bold border rounded-full cursor-pointer focus:outline-none appearance-none text-center ${getStatusColor(club.estadoSuscripcion)}`}
                >
                  <option value="activo">ACTIVO</option>
                  <option value="periodo_prueba">PRUEBA</option>
                  <option value="inactivo">INACTIVO</option>
                  <option value="vencido">VENCIDO</option>
                  <option value="cancelado">CANCELADO</option>
                </select>
              </td>
              
              <td className="p-4 text-sm font-semibold text-center text-gray-700">
                {club.userCount ?? 0}
              </td>
              <td className="p-4">
                <div className="flex items-center justify-center gap-2">
                  <button onClick={() => handleEditClick(club)} className="px-3 py-1 text-sm text-white transition bg-blue-500 rounded hover:bg-blue-600">
                    Editar
                  </button>
                  <button onClick={() => handleDelete(club._id)} className="px-3 py-1 text-sm text-white transition bg-red-500 rounded hover:bg-red-600">
                    Borrar
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {clubs.length === 0 && (
        <div className="p-8 text-center text-gray-500">
          <p className="text-lg">No hay clubes registrados todavía.</p>
          <p className="text-sm">Usa el formulario de arriba para dar de alta a tu primer cliente.</p>
        </div>
      )}
    </div>
  );
}

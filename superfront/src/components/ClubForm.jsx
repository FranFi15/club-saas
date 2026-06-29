import React from 'react';

export default function ClubForm({ formData, setFormData, editingId, handleSubmit, handleCancelEdit }) {
  const isCreate = !editingId;

  return (
    <div className="p-6 mb-8 bg-white border-t-4 border-indigo-500 rounded-lg shadow">
      <h2 className="mb-4 text-xl font-semibold text-indigo-900">
        {editingId ? '✏️ Editando Club' : '✨ Dar de alta nuevo Club'}
      </h2>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <input
          type="text"
          placeholder="Nombre (Ej: Club Olimpo)"
          className="p-2 border rounded"
          required
          value={formData.nombre}
          onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
        />

        <input
          type="text"
          placeholder="Identifier (Ej: club-olimpo)"
          className={`p-2 border rounded ${editingId ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : ''}`}
          required
          disabled={editingId !== null}
          title={
            editingId
              ? 'El identificador no se puede cambiar porque está atado a la base de datos'
              : ''
          }
          value={formData.urlIdentifier}
          onChange={(e) => setFormData({ ...formData, urlIdentifier: e.target.value })}
        />

        <input
          type="email"
          placeholder="Email de contacto"
          className="p-2 border rounded"
          required
          value={formData.emailContacto}
          onChange={(e) => setFormData({ ...formData, emailContacto: e.target.value })}
        />

        <input
          type="url"
          placeholder="URL del Logo (Opcional)"
          className="p-2 border rounded"
          value={formData.logoUrl}
          onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
        />

        <div className="flex items-center gap-2 p-1 border rounded bg-gray-50">
          <label className="pl-2 text-sm text-gray-600 whitespace-nowrap">Color Marca:</label>
          <input
            type="color"
            className="w-full h-8 p-0 bg-transparent border-0 rounded cursor-pointer"
            value={formData.primaryColor}
            onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
          />
        </div>

        {isCreate ? (
          <div className="p-4 border border-indigo-100 rounded-lg md:col-span-4 bg-indigo-50/60">
            <h3 className="mb-3 text-sm font-semibold text-indigo-900">
              Administrador del club (primer usuario)
            </h3>
            <p className="mb-4 text-sm text-gray-600">
              Este usuario podrá ingresar a la app del club con rol administrador y crear el resto del
              personal.
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <input
                type="text"
                placeholder="Nombre del admin"
                className="p-2 bg-white border rounded"
                required
                value={formData.adminNombre}
                onChange={(e) => setFormData({ ...formData, adminNombre: e.target.value })}
              />
              <input
                type="text"
                placeholder="Apellido del admin"
                className="p-2 bg-white border rounded"
                required
                value={formData.adminApellido}
                onChange={(e) => setFormData({ ...formData, adminApellido: e.target.value })}
              />
              <input
                type="email"
                placeholder="Email de acceso del admin"
                className="p-2 bg-white border rounded"
                required
                value={formData.adminEmail}
                onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
              />
              <input
                type="password"
                placeholder="Contraseña (mín. 6)"
                className="p-2 bg-white border rounded"
                required
                minLength={6}
                value={formData.adminPassword}
                onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
              />
            </div>
          </div>
        ) : null}

        <div className="flex gap-2 md:col-span-4">
          <button
            type="submit"
            className="flex-1 p-2 text-white transition bg-indigo-600 rounded hover:bg-indigo-700"
          >
            {editingId ? 'Guardar Cambios' : 'Crear Club y Admin'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="p-2 px-4 text-gray-700 transition bg-gray-200 rounded hover:bg-gray-300"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

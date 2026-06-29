import { useClubs } from './hooks/useClubs';
import ClubForm from './components/ClubForm';
import ClubTable from './components/ClubTable';

export default function Dashboard({ setToken }) {
  const {
    clubs,
    formData,
    setFormData,
    editingId,
    handleSubmit,
    handleEditClick,
    handleCancelEdit,
    handleDelete,
    handleStatusChange
  } = useClubs();

  const logout = () => {
    localStorage.removeItem('adminToken');
    setToken(null);
  };

  return (
    <div className="container p-8 mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Panel de Control SaaS</h1>
        <button onClick={logout} className="px-4 py-2 text-white bg-red-500 rounded hover:bg-red-600">Salir</button>
      </div>

      <ClubForm 
        formData={formData}
        setFormData={setFormData}
        editingId={editingId}
        handleSubmit={handleSubmit}
        handleCancelEdit={handleCancelEdit}
      />

      <ClubTable 
        clubs={clubs}
        handleStatusChange={handleStatusChange}
        handleEditClick={handleEditClick}
        handleDelete={handleDelete}
      />
    </div>
  );
}
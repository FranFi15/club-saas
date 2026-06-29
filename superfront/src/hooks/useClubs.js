import { useState, useEffect } from 'react';
import api from '../utils/api.js';
import { toast } from 'sonner';

export const useClubs = () => {
    const [clubs, setClubs] = useState([]);
    const initialFormState = {
        nombre: '',
        emailContacto: '',
        urlIdentifier: '',
        logoUrl: '',
        primaryColor: '#150224',
        adminNombre: '',
        adminApellido: '',
        adminEmail: '',
        adminPassword: '',
    };
    const [formData, setFormData] = useState(initialFormState);
    const [editingId, setEditingId] = useState(null);

    const fetchClubs = async () => {
        try {
            const { data } = await api.get('http://localhost:4000/api/clubs');
            setClubs(data);
        } catch (error) {
            toast.error('Error al cargar la lista de clubes');
        }
    };

    useEffect(() => {
        fetchClubs();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                await api.put(`http://localhost:4000/api/clubs/${editingId}`, formData);
                toast.success('Club actualizado exitosamente');
            } else {
                const { data } = await api.post('http://localhost:4000/api/clubs', formData);
                const adminEmail = data?.admin?.email;
                toast.success(
                    adminEmail
                        ? `Club creado. Admin: ${adminEmail}`
                        : 'Club creado exitosamente',
                );
            }
            setFormData(initialFormState);
            setEditingId(null);
            fetchClubs(); 
        } catch (error) {
            const message = error.response?.data?.message;
            toast.error(
                message ||
                    (editingId
                        ? 'Error al actualizar el club.'
                        : 'Error al crear el club. Verificá que el Identifier, Email o admin no estén duplicados.'),
            );
        }
    };

    const handleEditClick = (club) => {
        setEditingId(club._id);
        setFormData({
            nombre: club.nombre,
            emailContacto: club.emailContacto,
            urlIdentifier: club.urlIdentifier,
            logoUrl: club.logoUrl || '',
            primaryColor: club.primaryColor || '#150224',
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setFormData(initialFormState);
    };

    const handleDelete = async (id) => {
        if (window.confirm('¿Seguro que querés eliminar este club? Se perderá toda su base de datos.')) {
            try {
                await api.delete(`http://localhost:4000/api/clubs/${id}`);
                toast.success('Club eliminado correctamente');
                fetchClubs();
            } catch (error) {
                toast.error('Error al eliminar el club');
            }
        }
    };

    const handleStatusChange = async (id, newStatus) => {
        try {
            await api.patch(`http://localhost:4000/api/clubs/${id}`, { estadoSuscripcion: newStatus });
            toast.success('Estado actualizado correctamente');
            fetchClubs(); 
        } catch (error) {
            toast.error('Error al actualizar el estado del club');
        }
    };

    return {
        clubs,
        formData,
        setFormData,
        editingId,
        handleSubmit,
        handleEditClick,
        handleCancelEdit,
        handleDelete,
        handleStatusChange
    };
};

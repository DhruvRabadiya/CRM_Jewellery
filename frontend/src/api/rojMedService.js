import api from './axiosConfig';

export const getToday        = ()            => api.get('/roj-med/today').then(r => r.data.data);
export const getDay          = (date)        => api.get(`/roj-med/day/${date}`).then(r => r.data.data);
export const listDays        = (limit = 90)  => api.get('/roj-med/days', { params: { limit } }).then(r => r.data.data);
export const getTodaySummary = ()            => api.get('/roj-med/today-summary').then(r => r.data.data);

export const addEntry    = (date, data)   => api.post(`/roj-med/day/${date}/entries`, data).then(r => r.data.data);
export const editEntry   = (id, data)     => api.put(`/roj-med/entries/${id}`, data).then(r => r.data.data);
export const deleteEntry = (id)           => api.delete(`/roj-med/entries/${id}`).then(r => r.data.data);

export const closeDay    = (date, notes = '') => api.post(`/roj-med/day/${date}/close`, { notes }).then(r => r.data.data);
export const reopenDay   = (date)             => api.post(`/roj-med/day/${date}/reopen`).then(r => r.data.data);

export const getPartySummary = (from, to) =>
  api.get('/roj-med/party-summary', { params: { from, to } }).then(r => r.data.data);

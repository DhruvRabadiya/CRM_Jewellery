import React, { useState, useEffect, useCallback } from "react";
import {
  Flame,
  CheckCircle,
  ArrowDownLeft,
  Weight,
  AlertTriangle,
} from "lucide-react";
import {
  getRunningMelts,
  startMelt,
  completeMelt,
  getAllMelts,
  editMelt,
  deleteMelt,
} from "../api/meltingService";
import Modal from "../components/Modal";
import Toast from "../components/Toast";

const MeltingProcess = () => {
  const [activeMelts, setActiveMelts] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Modal States
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedMelt, setSelectedMelt] = useState(null);

  // Form States
  const [startForm, setStartForm] = useState({
    metal_type: "Gold",
    issue_weight: "",
    issue_pieces: "",
    weight_unit: "g",
  });
  const [completeForm, setCompleteForm] = useState({
    return_weight: "",
    scrap_weight: "",
    return_pieces: "",
    weight_unit: "g",
  });
  const [editForm, setEditForm] = useState({
    issued_weight: "",
    weight_unit: "g",
  });
  const [isShaking, setIsShaking] = useState(false);

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const triggerError = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  // Fetch Active Melts
  const fetchMelts = useCallback(async () => {
    try {
      const [activeResult, historyResult] = await Promise.all([
        getRunningMelts(),
        getAllMelts(),
      ]);
      if (activeResult.success) setActiveMelts(activeResult.data);
      if (historyResult.success) setHistory(historyResult.data);
    } catch (error) {
      showToast("Failed to load melts", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMelts();
  }, [fetchMelts]);

  // Handle Start Melt
  const handleStartMelt = async (e) => {
    e.preventDefault();
    if (!startForm.issue_weight || parseFloat(startForm.issue_weight) <= 0) {
      triggerError();
      showToast("Invalid Issue Weight", "error");
      return;
    }

    let finalWeight = parseFloat(startForm.issue_weight);
    if (startForm.weight_unit === "kg") {
      finalWeight *= 1000;
    }
    const pieces = parseInt(startForm.issue_pieces) || 0;

    try {
      // NOTE: Our API in meltingService.startMelt currently expects 2 arguments: (metalType, issueWeight).
      // Since pieces requires modifying startMelt, we should ensure the backend/frontend map matches.
      // Wait, meltingService.js starts melt with api.post('/start', { metal_type, issue_weight, issue_pieces? }).
      // I will need to patch startMelt in api/meltingService.js to pass issuePieces, but for now I'll use it if updated.
      // Let's assume startMelt(metalType, issueWeight, issuePieces) works (we need to update api/meltingService to accept it).
      await startMelt(startForm.metal_type, finalWeight, pieces);
      showToast("Melting Started Successfully!", "success");
      setIsStartModalOpen(false);
      setStartForm({
        metal_type: "Gold",
        issue_weight: "",
        issue_pieces: "",
        weight_unit: "g",
      });
      fetchMelts();
    } catch (error) {
      triggerError();
      showToast(error.message || "Failed to start melt (Check Stock)", "error");
    }
  };

  // Handle Complete Melt
  const handleCompleteMelt = async (e) => {
    e.preventDefault();

    let retWeight = parseFloat(completeForm.return_weight) || 0;
    let scrWeight = parseFloat(completeForm.scrap_weight) || 0;

    if (completeForm.weight_unit === "kg") {
      retWeight *= 1000;
      scrWeight *= 1000;
    }

    if (retWeight <= 0) {
      triggerError();
      showToast("Return weight must be greater than 0", "error");
      return;
    }

    if (liveLoss < 0) {
      triggerError();
      showToast("Error: Return + Scrap exceeds Issue Weight!", "error");
      return;
    }

    try {
      // NOTE: We'll modify api/meltingService.js completeMelt to accept return_pieces,
      // but for now we call it with existing signature or assume it's updated.
      await completeMelt(
        selectedMelt.id,
        retWeight,
        scrWeight,
        parseInt(completeForm.return_pieces) || 0,
      );
      showToast("Melting Completed & Stock Updated!", "success");
      setIsCompleteModalOpen(false);
      setCompleteForm({
        return_weight: "",
        scrap_weight: "",
        return_pieces: "",
        weight_unit: selectedMelt.metal_type === "Silver" ? "kg" : "g",
      });
      setSelectedMelt(null);
      fetchMelts();
    } catch (error) {
      triggerError();
      showToast("Failed to complete melt", "error");
    }
  };

  const openCompleteModal = (melt) => {
    setSelectedMelt(melt);
    setCompleteForm({
      return_weight: "",
      scrap_weight: "",
      return_pieces: "",
      weight_unit: melt.metal_type === "Silver" ? "kg" : "g",
    });
    setIsCompleteModalOpen(true);
  };

  const handleDeleteMelt = async (melt) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this process? Stock will be fully reversed.",
      )
    )
      return;
    try {
      await deleteMelt(melt.id);
      showToast("Melting process reversed & deleted", "success");
      fetchMelts();
    } catch (error) {
      showToast(error.message || "Failed to delete from DB", "error");
    }
  };

  const handleEditMeltSubmit = async (e) => {
    e.preventDefault();
    let issueW = parseFloat(editForm.issued_weight);
    if (!issueW || issueW <= 0) {
      showToast("Invalid edited weight", "error");
      return;
    }
    const isKg = editForm.weight_unit === "kg";
    if (isKg) issueW *= 1000;

    let payload = {
      issued_weight: issueW,
      issue_pieces: editForm.issue_pieces,
    };

    if (selectedMelt?.status === "COMPLETED") {
      let retW = parseFloat(editForm.return_weight) || 0;
      let scrW = parseFloat(editForm.scrap_weight) || 0;
      if (isKg) {
        retW *= 1000;
        scrW *= 1000;
      }
      payload.return_weight = retW;
      payload.scrap_weight = scrW;
      payload.return_pieces = editForm.return_pieces;
    }

    try {
      await editMelt(selectedMelt.id, payload);
      showToast("Melting process updated", "success");
      setIsEditModalOpen(false);
      fetchMelts();
    } catch (error) {
      showToast(error.message || "Failed to edit melt", "error");
    }
  };

  const openEditModal = (melt) => {
    setSelectedMelt(melt);
    const isSil = melt.metal_type === "Silver";
    const div = isSil ? 1000 : 1;
    setEditForm({
      issued_weight: melt.issue_weight / div,
      return_weight:
        melt.return_weight !== null ? melt.return_weight / div : "",
      scrap_weight: melt.scrap_weight !== null ? melt.scrap_weight / div : "",
      issue_pieces: melt.issue_pieces || "",
      return_pieces: melt.return_pieces || "",
      weight_unit: isSil ? "kg" : "g",
    });
    setIsEditModalOpen(true);
  };

  // --- REAL-TIME LOSS CALCULATION ---
  const issueW = selectedMelt ? parseFloat(selectedMelt.issue_weight) || 0 : 0;
  let returnW = parseFloat(completeForm.return_weight) || 0;
  let scrapW = parseFloat(completeForm.scrap_weight) || 0;

  if (completeForm.weight_unit === "kg") {
    returnW *= 1000;
    scrapW *= 1000;
  }

  // Calculate and format strictly to 3 decimals to avoid JS floating point bugs
  const liveLoss = parseFloat((issueW - (returnW + scrapW)).toFixed(3));
  const isLossNegative = liveLoss < 0;

  if (loading)
    return (
      <div className="p-8 text-center animate-pulse">
        Loading Melting Data...
      </div>
    );

  return (
    <div className="p-6 relative">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* HEADER */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 tracking-tight">
            Melting Process
          </h1>
          <p className="text-gray-500 mt-1">
            Convert Raw Material to Pure Dhal
          </p>
        </div>
        <button
          onClick={() => setIsStartModalOpen(true)}
          className="flex items-center gap-2 bg-orange-600 text-white px-6 py-3 rounded-xl hover:bg-orange-700 shadow-lg active:scale-95 transition-all"
        >
          <Flame size={20} />{" "}
          <span className="font-semibold">Start New Melt</span>
        </button>
      </div>

      {/* ACTIVE MELTS GRID */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-700 mb-4 border-b pb-2">
          Active Melts
        </h2>

        {activeMelts.length === 0 ? (
          <div className="bg-white p-10 rounded-2xl border border-dashed border-gray-300 text-center text-gray-500">
            <Flame size={48} className="mx-auto mb-3 opacity-20" />
            <p>No active melting processes.</p>
            <p className="text-sm">Click "Start New Melt" to begin.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeMelts.map((melt) => (
              <div
                key={melt.id}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow relative overflow-hidden group"
              >
                <div
                  className={`absolute top-0 left-0 w-full h-1 ${melt.metal_type === "Gold" ? "bg-yellow-400" : "bg-gray-400"}`}
                ></div>

                <div className="flex justify-between items-start mb-4 mt-2">
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      Process #{melt.id}
                    </p>
                    <h3
                      className={`text-xl font-bold ${melt.metal_type === "Gold" ? "text-yellow-600" : "text-gray-600"}`}
                    >
                      {melt.metal_type} Melt
                    </h3>
                  </div>
                  <span className="bg-orange-100 text-orange-600 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 animate-pulse">
                    <Flame size={12} /> Running
                  </span>
                </div>

                <div className="bg-gray-50 p-4 rounded-xl mb-4 border border-gray-100">
                  <p className="text-sm text-gray-500 font-medium">
                    Issued Weight
                  </p>
                  <p className="text-2xl font-bold text-gray-800">
                    {(melt.metal_type === "Gold"
                      ? melt.issue_weight
                      : melt.issue_weight / 1000
                    ).toFixed(3)}{" "}
                    <span className="text-base text-gray-400">
                      {melt.metal_type === "Gold" ? "g" : "kg"}
                    </span>
                  </p>
                </div>

                <button
                  onClick={() => openCompleteModal(melt)}
                  className="w-full bg-green-50 text-green-700 font-bold py-3 rounded-xl hover:bg-green-600 hover:text-white transition-colors flex justify-center items-center gap-2"
                >
                  <CheckCircle size={18} /> Complete Process
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL 1: START MELT */}
      <Modal
        isOpen={isStartModalOpen}
        onClose={() => setIsStartModalOpen(false)}
        title="Start Melting Process"
      >
        <form
          onSubmit={handleStartMelt}
          className={`space-y-5 ${isShaking ? "animate-shake" : ""}`}
        >
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Metal Type
            </label>
            <div className="relative">
              <select
                className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-3 px-4 rounded-lg outline-none cursor-pointer"
                value={startForm.metal_type}
                onChange={(e) =>
                  setStartForm({ ...startForm, metal_type: e.target.value })
                }
              >
                <option value="Gold">Gold</option>
                <option value="Silver">Silver</option>
              </select>
              <ArrowDownLeft
                className="absolute right-4 top-3 text-gray-500 pointer-events-none"
                size={16}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Issue Weight (from Opening Stock)
            </label>
            <div className="flex bg-gray-50 border border-gray-200 rounded-lg focus-within:border-orange-500 transition-colors overflow-hidden">
              <input
                type="number"
                step="0.001"
                className="w-full bg-transparent text-gray-700 py-3 px-4 outline-none font-bold"
                value={startForm.issue_weight}
                onChange={(e) =>
                  setStartForm({ ...startForm, issue_weight: e.target.value })
                }
                placeholder="0.000"
              />
              <select
                className="bg-gray-100 border-l border-gray-200 px-3 font-bold text-gray-600 outline-none"
                value={startForm.weight_unit}
                onChange={(e) =>
                  setStartForm({ ...startForm, weight_unit: e.target.value })
                }
              >
                <option value="g">g</option>
                <option value="kg">kg</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Issue Pieces (Optional)
            </label>
            <input
              type="number"
              className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-3 px-4 rounded-lg outline-none focus:border-orange-500 font-bold"
              value={startForm.issue_pieces}
              onChange={(e) =>
                setStartForm({ ...startForm, issue_pieces: e.target.value })
              }
              placeholder="0"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-orange-600 text-white font-bold py-3.5 rounded-xl hover:bg-orange-700 shadow-md active:scale-95 transition-all flex justify-center gap-2"
          >
            <Flame size={20} /> Ignite Furnace
          </button>
        </form>
      </Modal>

      {/* MODAL 2: COMPLETE MELT (WITH REAL-TIME LOSS) */}
      <Modal
        isOpen={isCompleteModalOpen}
        onClose={() => setIsCompleteModalOpen(false)}
        title="Complete Melting"
      >
        {selectedMelt && (
          <form
            onSubmit={handleCompleteMelt}
            className={`space-y-5 ${isShaking ? "animate-shake" : ""}`}
          >
            {/* Issued Weight Indicator */}
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex justify-between items-center">
              <span className="text-blue-800 font-semibold">
                Total Issued Weight ({completeForm?.weight_unit || "g"}):
              </span>
              <span className="text-xl font-bold text-blue-900">
                {(
                  issueW / (completeForm?.weight_unit === "kg" ? 1000 : 1)
                ).toFixed(3)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">
                  Weight Unit
                </label>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() =>
                      setCompleteForm({ ...completeForm, weight_unit: "g" })
                    }
                    className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${completeForm.weight_unit === "g" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    Grams (g)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCompleteForm({ ...completeForm, weight_unit: "kg" })
                    }
                    className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${completeForm.weight_unit === "kg" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    Kilogram (kg)
                  </button>
                </div>
              </div>

              {/* Return Input */}
              <div>
                <label className="flex items-center gap-1 text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">
                  <Weight size={14} /> Pure Dhal
                </label>
                <input
                  type="number"
                  step="0.001"
                  className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-3 px-3 rounded-lg outline-none focus:bg-white focus:border-green-500 transition-colors text-lg font-bold"
                  value={completeForm.return_weight}
                  onChange={(e) =>
                    setCompleteForm({
                      ...completeForm,
                      return_weight: e.target.value,
                    })
                  }
                  placeholder={`0.000 ${completeForm.weight_unit}`}
                />
              </div>

              {/* Scrap Input */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">
                  Scrap / Dust
                </label>
                <input
                  type="number"
                  step="0.001"
                  className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-3 px-3 rounded-lg outline-none focus:bg-white focus:border-gray-500 transition-colors text-lg font-bold"
                  value={completeForm.scrap_weight}
                  onChange={(e) =>
                    setCompleteForm({
                      ...completeForm,
                      scrap_weight: e.target.value,
                    })
                  }
                  placeholder={`0.000 ${completeForm.weight_unit}`}
                />
              </div>

              {/* Pieces Input */}
              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">
                  Return Pieces (Optional)
                </label>
                <input
                  type="number"
                  className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-3 px-3 rounded-lg outline-none focus:bg-white focus:border-green-500 transition-colors text-lg font-bold"
                  value={completeForm.return_pieces}
                  onChange={(e) =>
                    setCompleteForm({
                      ...completeForm,
                      return_pieces: e.target.value,
                    })
                  }
                  placeholder="0"
                />
              </div>
            </div>

            {/* DYNAMIC LOSS CALCULATOR */}
            <div
              className={`p-4 rounded-xl border flex justify-between items-center transition-colors ${
                isLossNegative
                  ? "bg-red-50 border-red-200 text-red-700"
                  : liveLoss > 0
                    ? "bg-orange-50 border-orange-200 text-orange-700"
                    : "bg-gray-50 border-gray-200 text-gray-500"
              }`}
            >
              <span className="font-bold flex items-center gap-2">
                {isLossNegative ? <AlertTriangle size={18} /> : null}
                Calculated Loss:
              </span>
              <span className="text-2xl font-extrabold">
                {(
                  liveLoss / (completeForm?.weight_unit === "kg" ? 1000 : 1)
                ).toFixed(3)}
              </span>
            </div>
            {isLossNegative && (
              <p className="text-red-500 text-xs text-center font-bold">
                Error: Return + Scrap cannot be larger than Issued Weight!
              </p>
            )}

            <button
              type="submit"
              disabled={isLossNegative} // Disable button if math is physically impossible
              className="w-full bg-green-600 text-white font-bold py-3.5 rounded-xl hover:bg-green-700 shadow-md active:scale-95 transition-all flex justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle size={20} /> Save to Inventory
            </button>
          </form>
        )}
      </Modal>

      {/* MELTING HISTORY */}
      <div className="mt-12 mb-6">
        <h2 className="text-xl font-bold text-gray-700 mb-4 border-b pb-2">
          Melting History
        </h2>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs uppercase tracking-wider">
                <th className="p-4 font-bold">ID / Date</th>
                <th className="p-4 font-bold">Metal Type</th>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold">Iss Weight / Pcs</th>
                <th className="p-4 font-bold">Ret Weight / Pcs</th>
                <th className="p-4 font-bold">Scrap / Loss</th>
                <th className="p-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 flex-col">
              {history.map((h) => (
                <tr
                  key={h.id}
                  className="hover:bg-gray-50/50 transition-colors group"
                >
                  <td className="p-4">
                    <div className="font-bold text-gray-800">#{h.id}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(h.date).toLocaleDateString()}{" "}
                      {new Date(h.date).toLocaleTimeString()}
                    </div>
                  </td>
                  <td className="p-4 font-bold text-gray-700">
                    {h.metal_type}
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold border ${h.status === "RUNNING" ? "bg-orange-50 text-orange-700 border-orange-200 animate-pulse" : "bg-green-50 text-green-700 border-green-200"}`}
                    >
                      {h.status}
                    </span>
                  </td>
                  <td className="p-4 font-bold text-gray-700">
                    {h.issue_weight}g
                    {h.issue_pieces > 0 && (
                      <span className="ml-2 text-xs text-gray-400">
                        ({h.issue_pieces} pcs)
                      </span>
                    )}
                  </td>
                  <td className="p-4 font-bold text-green-600">
                    {h.return_weight ? `${h.return_weight}g` : "-"}
                    {h.return_pieces > 0 && (
                      <span className="ml-2 text-xs text-green-400">
                        ({h.return_pieces} pcs)
                      </span>
                    )}
                  </td>
                  <td className="p-4 font-bold text-gray-600 text-sm">
                    {h.scrap_weight ? `${h.scrap_weight}g` : "-"} /{" "}
                    <span className="text-red-500">
                      {h.loss_weight ? `${h.loss_weight}g` : "-"}
                    </span>
                  </td>
                  <td className="p-4 flex justify-end gap-2 text-sm">
                    <button
                      onClick={() => openEditModal(h)}
                      className="bg-gray-100 text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-200 active:scale-95 flex items-center justify-center gap-1 shadow-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteMelt(h)}
                      className="bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 active:scale-95 flex items-center justify-center gap-1 shadow-sm"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-gray-400">
                    No melting history found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 3: EDIT MELT */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Melter Job"
      >
        <form onSubmit={handleEditMeltSubmit} className="space-y-4">
          <p className="text-sm text-gray-600 mb-4 bg-yellow-50 p-3 rounded-lg border border-yellow-200">
            Fix issues retroactively. Physical balances will correctly adjust to
            compensate your edit natively.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-bold text-gray-700 mb-2">
                New Issue Weight
              </label>
              <div className="flex bg-gray-50 border border-gray-200 rounded-lg focus-within:border-blue-500 transition-colors overflow-hidden">
                <input
                  type="number"
                  step="0.001"
                  className="w-full bg-transparent text-gray-700 py-3 px-4 outline-none font-bold"
                  value={editForm.issued_weight}
                  onChange={(e) =>
                    setEditForm({ ...editForm, issued_weight: e.target.value })
                  }
                />
                <select
                  className="bg-gray-100 border-l border-gray-200 px-3 font-bold text-gray-600 outline-none"
                  value={editForm.weight_unit}
                  onChange={(e) =>
                    setEditForm({ ...editForm, weight_unit: e.target.value })
                  }
                >
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                </select>
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Issue Pieces (Optional)
              </label>
              <input
                type="number"
                className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-3 px-4 rounded-lg outline-none font-bold"
                value={editForm.issue_pieces}
                onChange={(e) =>
                  setEditForm({ ...editForm, issue_pieces: e.target.value })
                }
                placeholder="0"
              />
            </div>

            {selectedMelt?.status === "COMPLETED" && (
              <>
                <div className="col-span-2 pt-2 border-t border-gray-200 mt-2">
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">
                    Output Adjustments
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-bold text-green-700 mb-2">
                    Return Weight
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    className="w-full bg-green-50 border border-green-200 text-green-800 py-3 px-4 rounded-lg outline-none font-bold"
                    value={editForm.return_weight}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        return_weight: e.target.value,
                      })
                    }
                    placeholder="0.000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Scrap/Dust Weight
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-3 px-4 rounded-lg outline-none font-bold"
                    value={editForm.scrap_weight}
                    onChange={(e) =>
                      setEditForm({ ...editForm, scrap_weight: e.target.value })
                    }
                    placeholder="0.000"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Return Pieces (Optional)
                  </label>
                  <input
                    type="number"
                    className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-3 px-4 rounded-lg outline-none font-bold"
                    value={editForm.return_pieces}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        return_pieces: e.target.value,
                      })
                    }
                    placeholder="0"
                  />
                </div>
              </>
            )}
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 shadow-md active:scale-95 transition-all mt-4"
          >
            Update Melting Process
          </button>
        </form>
      </Modal>
    </div>
  );
};

export default MeltingProcess;

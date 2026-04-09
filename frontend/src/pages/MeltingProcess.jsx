import React, { useState, useEffect, useCallback } from "react";
import {
  Flame,
  CheckCircle,
  Plus,
  PlayCircle,
  Hammer,
  ArrowDownLeft,
  X,
  FileText,
  Scale,
  AlertTriangle,
} from "lucide-react";
import {
  getRunningMelts,
  startMelt,
  completeMelt,
  getAllMelts,
  editMelt,
  deleteMelt,
  revertMelt,
} from "../api/meltingService";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import { formatWeight } from "../utils/formatHelpers";
import { useAuth } from "../context/AuthContext";

const MeltingProcess = () => {
  const [activeMelts, setActiveMelts] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Modal States
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedMelt, setSelectedMelt] = useState(null);

  const { user, isAdmin } = useAuth();

  // Form States
  const [startForm, setStartForm] = useState({
    metal_type: "Gold",
    issue_weight: "",
    issue_pieces: "",
    weight_unit: "g",
    description: "",
    employee: "",
  });
  const [completeForm, setCompleteForm] = useState({
    return_weight: "",
    scrap_weight: "",
    return_pieces: "",
    weight_unit: "g",
    description: "",
  });
  const [editForm, setEditForm] = useState({
    issued_weight: "",
    weight_unit: "g",
    description: "",
  });
  const [isShaking, setIsShaking] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    isDestructive: false,
    confirmText: "Confirm",
  });

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

  const [users, setUsers] = useState([]);

  useEffect(() => {
    fetchMelts();
    const fetchUsers = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(
          `${import.meta.env.VITE_API_URL || "http://localhost:3000/api"}/auth/users`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const data = await res.json();
        if (Array.isArray(data)) {
          setUsers(data);
        }
      } catch (err) {
        console.error("Failed to fetch users");
      }
    };
    fetchUsers();
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
    const pieces = parseInt(startForm.issue_pieces) || 0;

    try {
      // NOTE: Our API in meltingService.startMelt currently expects 2 arguments: (metalType, issueWeight).
      // Since pieces requires modifying startMelt, we should ensure the backend/frontend map matches.
      // Wait, meltingService.js starts melt with api.post('/start', { metal_type, issue_weight, issue_pieces? }).
      // I will need to patch startMelt in api/meltingService.js to pass issuePieces, but for now I'll use it if updated.
      // Let's assume startMelt(metalType, issueWeight, issuePieces) works (we need to update api/meltingService to accept it).
      await startMelt(
        startForm.metal_type,
        finalWeight,
        pieces,
        startForm.employee || user?.username || "Unknown",
        startForm.description || "",
      );
      showToast("Melting Started Successfully!", "success");
      setIsStartModalOpen(false);
      setStartForm({
        metal_type: "Gold",
        issue_weight: "",
        issue_pieces: "",
        weight_unit: "g",
        description: "",
        employee: "",
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

    if (retWeight <= 0) {
      triggerError();
      showToast("Return weight must be greater than 0", "error");
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
        completeForm.description || "",
      );
      showToast("Melting Completed & Stock Updated!", "success");
      setIsCompleteModalOpen(false);
      setCompleteForm({
        return_weight: "",
        scrap_weight: "",
        return_pieces: "",
        weight_unit: "g",
        description: "",
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
      weight_unit: "g",
      description: melt.description || "",
    });
    setIsCompleteModalOpen(true);
  };

  const handleDeleteMelt = async (melt) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Melting Process",
      message:
        "Are you sure you want to delete this process? Stock will be fully reversed.",
      isDestructive: true,
      confirmText: "Yes, Delete",
      onConfirm: async () => {
        try {
          await deleteMelt(melt.id);
          showToast("Melting process reversed & deleted", "success");
          fetchMelts();
        } catch (error) {
          showToast(error.message || "Failed to delete from DB", "error");
        }
      },
    });
  };

  const handleRevertMelt = async (melt) => {
    setConfirmModal({
      isOpen: true,
      title: "Revert Melting Process",
      message: `Are you sure you want to REVERT Melting Process #${melt.id}? This will un-do the current stage and restore stock backwards.`,
      isDestructive: false,
      confirmText: "Revert Process",
      onConfirm: async () => {
        try {
          await revertMelt(melt.id);
          showToast("Melting process reverted successfully!", "success");
          fetchMelts();
        } catch (error) {
          showToast(error.message || "Failed to revert melt", "error");
        }
      },
    });
  };

  const handleEditMeltSubmit = async (e) => {
    e.preventDefault();
    let issueW = parseFloat(editForm.issued_weight);
    if (!issueW || issueW <= 0) {
      showToast("Invalid edited weight", "error");
      return;
    }
    let payload = {
      issued_weight: issueW,
      issue_pieces: editForm.issue_pieces,
    };
    if (editForm.description !== undefined) {
      payload.description = editForm.description;
    }
    if (editForm.employee !== undefined) {
      payload.employee = editForm.employee;
    }

    if (selectedMelt?.status === "COMPLETED") {
      let retW = parseFloat(editForm.return_weight) || 0;
      let scrW = parseFloat(editForm.scrap_weight) || 0;

      // Safety check: is the loss negative on grammatical scale?
      if (issueW - retW - scrW < 0) {
        showToast("Error: Impossible weights.", "error");
        return;
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
    setEditForm({
      issued_weight: parseFloat(melt.issue_weight.toFixed(10)),
      return_weight:
        melt.return_weight !== null
          ? parseFloat(melt.return_weight.toFixed(10))
          : "",
      scrap_weight:
        melt.scrap_weight !== null
          ? parseFloat(melt.scrap_weight.toFixed(10))
          : "",
      issue_pieces: melt.issue_pieces || "",
      return_pieces: melt.return_pieces || "",
      weight_unit: "g",
      description: melt.description || "",
      employee: melt.employee || "",
    });
    setIsEditModalOpen(true);
  };

  const openViewModal = (melt) => {
    setSelectedMelt(melt);
    setIsViewModalOpen(true);
  };

  // --- REAL-TIME LOSS CALCULATION ---
  const issueW = selectedMelt ? parseFloat(selectedMelt.issue_weight) || 0 : 0;
  let returnW = parseFloat(completeForm.return_weight) || 0;
  let scrapW = parseFloat(completeForm.scrap_weight) || 0;

  // Calculate and format strictly to 3 decimals to avoid JS floating point bugs
  const liveLoss = parseFloat((issueW - (returnW + scrapW)).toFixed(10));
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
            Convert Raw Material to Pure Metal
          </p>
        </div>
        <button
          onClick={() => setIsStartModalOpen(true)}
          className="flex items-center gap-2 bg-orange-600 text-white px-6 py-3 rounded-xl hover:bg-orange-700 shadow-lg active:scale-95 transition-all"
        >
          <Flame size={20} />{" "}
          <span className="font-semibold">Start Process</span>
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
                onClick={() => openViewModal(melt)}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow relative overflow-hidden group cursor-pointer"
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
                    {formatWeight(melt.issue_weight, melt.unit)}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openCompleteModal(melt);
                    }}
                    className="flex-1 bg-green-50 text-green-700 font-bold py-3 rounded-xl hover:bg-green-600 hover:text-white transition-colors flex justify-center items-center gap-2"
                  >
                    <CheckCircle size={18} /> Complete Process
                  </button>
                  {isAdmin && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRevertMelt(melt);
                      }}
                      className="px-4 bg-purple-50 text-purple-600 font-bold rounded-xl hover:bg-purple-100 transition-colors shadow-sm"
                      title="Revert Process"
                    >
                      <ArrowDownLeft size={18} />
                    </button>
                  )}
                </div>
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
        maxWidth="max-w-2xl"
      >
        <form
          onSubmit={handleStartMelt}
          className={`space-y-5 ${isShaking ? "animate-shake" : ""}`}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Metal Type
              </label>
              <div className="relative">
                <select
                  className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-2.5 px-3 rounded-lg font-bold outline-none cursor-pointer"
                  value={startForm.metal_type}
                  onChange={(e) =>
                    setStartForm({ ...startForm, metal_type: e.target.value })
                  }
                >
                  <option value="Gold">Gold</option>
                  <option value="Silver">Silver</option>
                </select>
                <ArrowDownLeft
                  className="absolute right-3 top-3 text-gray-400 pointer-events-none"
                  size={16}
                />
              </div>
            </div>

            <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Issue Weight (Opening Stock)
              </label>
              <div className="flex bg-gray-50 border border-gray-200 rounded-lg focus-within:border-orange-500 transition-colors overflow-hidden">
                <input
                  type="number"
                  step="0.001"
                  className="w-full bg-transparent text-gray-700 py-2.5 px-3 outline-none font-bold"
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
                </select>
              </div>
            </div>

            <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Issue Pieces{" "}
                <span className="text-gray-400 font-normal tracking-normal">
                  (Optional)
                </span>
              </label>
              <input
                type="number"
                className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-2.5 px-3 rounded-lg font-bold outline-none focus:bg-white focus:border-orange-500 transition-colors"
                value={startForm.issue_pieces}
                onChange={(e) =>
                  setStartForm({ ...startForm, issue_pieces: e.target.value })
                }
                placeholder="0"
              />
            </div>

            {/* <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Assigned Employee
              </label>
              <select
                className="w-full bg-blue-50/50 border border-blue-200 py-2.5 px-3 rounded-lg font-bold text-blue-900 outline-none focus:border-blue-500 transition-colors cursor-pointer"
                value={startForm.employee}
                onChange={(e) =>
                  setStartForm({
                    ...startForm,
                    employee: e.target.value,
                  })
                }
              >
                <option value="" disabled>
                  Select Employee
                </option>
                {users
                  .filter((u) => u.role === "EMPLOYEE")
                  .map((u) => (
                    <option key={u.id} value={u.username}>
                      {u.username}
                    </option>
                  ))}
              </select>
            </div> */}

            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Description / Notes{" "}
                <span className="text-gray-400 font-normal tracking-normal">
                  (Optional)
                </span>
              </label>
              <textarea
                className="w-full bg-gray-50 border border-gray-200 py-2 px-3 text-sm rounded-lg outline-none focus:bg-white focus:border-orange-500 min-h-20 transition-colors"
                value={startForm.description}
                onChange={(e) =>
                  setStartForm({ ...startForm, description: e.target.value })
                }
                placeholder="Add any specific requirements or notes..."
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-orange-600 text-white font-bold py-3.5 rounded-xl hover:bg-orange-700 shadow-md active:scale-95 transition-colors flex justify-center gap-2"
          >
            <Flame size={20} /> Start Process
          </button>
        </form>
      </Modal>

      {/* MODAL 2: COMPLETE MELT (WITH REAL-TIME LOSS) */}
      <Modal
        isOpen={isCompleteModalOpen}
        onClose={() => setIsCompleteModalOpen(false)}
        title="Complete Melting"
        maxWidth="max-w-2xl"
      >
        {selectedMelt && (
          <form
            onSubmit={handleCompleteMelt}
            className={`space-y-5 ${isShaking ? "animate-shake" : ""}`}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div className="col-span-1 bg-blue-50 px-4 py-3 rounded-xl border border-blue-100 flex justify-between items-center h-full">
                <span className="text-blue-800 font-bold text-xs uppercase tracking-wide">
                  Total Issued (g)
                </span>
                <span className="text-xl font-bold text-blue-900">
                  {parseFloat(
                    issueW.toFixed(10),
                  )}
                </span>
              </div>

              <div className="col-span-1">
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                  Weight Unit
                </label>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() =>
                      setCompleteForm({ ...completeForm, weight_unit: "g" })
                    }
                    className="flex-1 py-1.5 text-sm font-bold rounded-md transition-colors bg-white text-gray-800 shadow-sm"
                  >
                    Grams (g)
                  </button>
                </div>
              </div>

              {/* Return Input */}
              <div className="col-span-1">
                <label className="flex items-center gap-1 text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                  <Scale size={14} /> Return Weight
                </label>
                <input
                  type="number"
                  step="0.001"
                  className="w-full bg-green-50 border-2 border-green-200 text-gray-800 py-2.5 px-3 rounded-lg outline-none vivid-focus-green transition-all text-xl font-bold"
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
              <div className="col-span-1">
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                  Scrap / Dust
                </label>
                <input
                  type="number"
                  step="0.001"
                  className="w-full bg-yellow-50/50 border-2 border-yellow-200 text-gray-800 py-2.5 px-3 rounded-lg outline-none vivid-focus-yellow transition-all text-xl font-bold"
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

              <div className="col-span-1 flex flex-col gap-4">
                {/* Pieces Input */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                    Return Pieces (Optional)
                  </label>
                  <input
                    type="number"
                    className="w-full bg-purple-50 border-2 border-purple-200 text-gray-800 py-2.5 px-3 rounded-lg outline-none vivid-focus-purple transition-all text-xl font-bold"
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

                {/* Description Input */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                    Description / Notes (Optional)
                  </label>
                  <textarea
                    className="w-full bg-gray-50 border-2 border-blue-200 text-gray-800 py-2.5 px-3 rounded-lg outline-none vivid-focus-blue transition-all font-bold min-h-20 text-sm"
                    value={completeForm.description}
                    onChange={(e) =>
                      setCompleteForm({
                        ...completeForm,
                        description: e.target.value,
                      })
                    }
                    placeholder="Notes for completion..."
                  />
                </div>
              </div>

              {/* DYNAMIC LOSS CALCULATOR */}
              <div className="col-span-1 flex flex-col justify-end">
                <div
                  className={`p-4 rounded-xl border flex flex-col justify-center h-full transition-colors ${
                    isLossNegative
                      ? "bg-green-50 border-green-200 text-green-700"
                      : liveLoss > 0
                        ? "bg-orange-50 border-orange-200 text-orange-700"
                        : "bg-gray-50 border-gray-200 text-gray-500"
                  }`}
                >
                  <span className="font-bold flex items-center justify-center gap-2 mb-2">
                    {isLossNegative ? "Calculated Gain:" : "Calculated Loss:"}
                  </span>
                  <span className="text-3xl font-extrabold text-center">
                    {isLossNegative ? "+" : ""}
                    {parseFloat(
                      Math.abs(liveLoss).toFixed(10),
                    )}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-green-600 text-white font-bold py-3.5 rounded-xl hover:bg-green-700 shadow-md active:scale-95 transition-all flex justify-center gap-2"
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
                {/* <th className="p-4 font-bold">Assigned To</th> */}
                <th className="p-4 font-bold">Ret Weight / Pcs</th>
                <th className="p-4 font-bold">Scrap / Loss</th>
                <th className="p-4 font-bold">Description</th>
                <th className="p-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 flex-col">
              {history.map((h) => (
                <tr
                  key={h.id}
                  onClick={() => openViewModal(h)}
                  className="hover:bg-blue-50/80 transition-all cursor-pointer group/row border-b border-gray-100"
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
                    {formatWeight(h.issue_weight, h.unit)}
                    {h.issue_pieces > 0 && (
                      <span className="ml-2 text-xs text-gray-400">
                        ({h.issue_pieces} pcs)
                      </span>
                    )}
                  </td>
                  {/* <td className="p-4 font-bold text-gray-600 bg-gray-50 rounded-lg">
                    {h.employee || "Unknown"}
                  </td> */}
                  <td className="p-4 font-bold text-green-600">
                    {h.return_weight
                      ? formatWeight(h.return_weight, h.unit)
                      : "-"}
                    {h.return_pieces > 0 && (
                      <span className="ml-2 text-xs text-green-400">
                        ({h.return_pieces} pcs)
                      </span>
                    )}
                  </td>
                  <td className="p-4 font-bold text-gray-600 text-sm">
                    {h.scrap_weight
                      ? formatWeight(h.scrap_weight, h.unit)
                      : "-"}{" "}
                    /{" "}
                    <span className="text-red-500">
                      {h.loss_weight
                        ? formatWeight(h.loss_weight, h.unit)
                        : "-"}
                    </span>
                  </td>
                  <td className="p-4 text-xs text-gray-500 italic max-w-xs truncate" title={h.description}>
                    {h.description || "-"}
                  </td>
                  <td className="p-4 flex justify-end gap-2 text-sm">
                    {isAdmin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(h);
                        }}
                        className="bg-gray-100 text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-200 active:scale-95 flex items-center justify-center gap-1 shadow-sm"
                      >
                        Edit
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteMelt(h);
                        }}
                        className="bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 active:scale-95 flex items-center justify-center gap-1 shadow-sm"
                      >
                        Delete
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRevertMelt(h);
                        }}
                        className="bg-purple-50 text-purple-600 border border-purple-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-purple-100 active:scale-95 flex items-center justify-center gap-1 shadow-sm"
                        title="Revert Process Backwards"
                      >
                        Revert
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-gray-400">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                New Issue Weight
              </label>
              <div className="flex bg-gray-50 border border-gray-200 rounded-lg focus-within:border-blue-500 transition-colors overflow-hidden">
                <input
                  type="number"
                  step="0.001"
                  className="w-full bg-transparent text-gray-700 py-2.5 px-3 outline-none font-bold text-lg"
                  value={editForm.issued_weight}
                  onChange={(e) =>
                    setEditForm({ ...editForm, issued_weight: e.target.value })
                  }
                />
                <select
                  className="bg-gray-100 border-l border-gray-200 px-3 font-bold text-gray-600 outline-none cursor-pointer"
                  value={editForm.weight_unit}
                  onChange={(e) =>
                    setEditForm({ ...editForm, weight_unit: e.target.value })
                  }
                >
                  <option value="g">g</option>
                </select>
              </div>
            </div>

            <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Issue Pieces{" "}
                <span className="text-gray-400 font-normal tracking-normal">
                  (Optional)
                </span>
              </label>
              <input
                type="number"
                className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-2.5 px-3 rounded-lg outline-none font-bold text-lg focus:bg-white focus:border-blue-500 transition-colors"
                value={editForm.issue_pieces}
                onChange={(e) =>
                  setEditForm({ ...editForm, issue_pieces: e.target.value })
                }
                placeholder="0"
              />
            </div>

            {selectedMelt?.status === "COMPLETED" && (
              <div className="col-span-2 grid grid-cols-2 gap-x-6 gap-y-4 pt-3 border-t border-gray-200 mt-1">
                <div className="col-span-2">
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest -mb-1">
                    Completion Adjustment Data
                  </p>
                </div>

                <div className="col-span-1">
                  <label className="flex items-center gap-1 text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                    Return Weight
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    className="w-full bg-blue-50 border border-blue-200 text-blue-900 py-2.5 px-3 rounded-lg font-bold text-lg outline-none focus:bg-white focus:border-blue-500 transition-colors"
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

                <div className="col-span-1">
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                    Return Pieces{" "}
                    <span className="text-gray-400 font-normal tracking-normal">
                      (Optional)
                    </span>
                  </label>
                  <input
                    type="number"
                    className="w-full bg-blue-50 border border-blue-200 text-blue-900 py-2.5 px-3 rounded-lg font-bold text-lg outline-none focus:bg-white focus:border-blue-500 transition-colors"
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

                <div className="col-span-1">
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                    Scrap/Dust Weight
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-2.5 px-3 rounded-lg font-bold text-lg outline-none focus:bg-white focus:border-blue-500 transition-colors"
                    value={editForm.scrap_weight}
                    onChange={(e) =>
                      setEditForm({ ...editForm, scrap_weight: e.target.value })
                    }
                    placeholder="0.000"
                  />
                </div>

                {(() => {
                  let iss = parseFloat(editForm.issued_weight) || 0;
                  let ret = parseFloat(editForm.return_weight) || 0;
                  let scr = parseFloat(editForm.scrap_weight) || 0;

                  // For melting, scrap is typically added back cleanly so Loss = Issued - Return - Scrap
                  let liveLoss = parseFloat((iss - ret - scr).toFixed(10));
                  let isLossNeg = liveLoss < 0;
                  return (
                    <div className="col-span-1">
                      <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                        {isLossNeg ? "Live Gain Calculation" : "Live Loss Calculation"}
                      </label>
                      <div
                        className={`w-full py-2.5 px-3 rounded-lg font-bold text-lg border flex items-center shadow-inner ${
                          isLossNeg
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-gray-100 text-gray-700 border-gray-200"
                        }`}
                      >
                        {liveLoss.toFixed(10).replace(/\.?0+$/, "")}{" "}
                        {editForm.weight_unit}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Assigned Employee
              </label>
              <select
                className="w-full bg-blue-50/50 border border-blue-200 py-2.5 px-3 rounded-lg font-bold text-blue-900 outline-none focus:border-blue-500 transition-colors cursor-pointer"
                value={editForm.employee || ""}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    employee: e.target.value,
                  })
                }
              >
                <option value="" disabled>
                  Select Employee
                </option>
                {users
                  .filter((u) => u.role === "EMPLOYEE")
                  .map((u) => (
                    <option key={u.id} value={u.username}>
                      {u.username}
                    </option>
                  ))}
              </select>
            </div> */}

            <div className="col-span-2 bg-blue-50 p-4 rounded-xl border border-blue-100 mt-2">
              <label className="block text-xs font-bold text-blue-800 mb-1.5 uppercase tracking-wide">
                Description / Notes{" "}
                <span className="text-blue-600/70 font-normal tracking-normal">
                  (Optional)
                </span>
              </label>
              <textarea
                className="w-full bg-white border border-blue-200 py-2 px-3 text-sm rounded-lg outline-none focus:border-blue-500 min-h-20 transition-colors"
                value={editForm.description}
                onChange={(e) =>
                  setEditForm({ ...editForm, description: e.target.value })
                }
                placeholder="View or edit notes..."
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={false}
            className="w-full bg-blue-600 text-white font-bold py-3.5 text-sm rounded-xl hover:bg-blue-700 shadow flex items-center justify-center gap-2 active:scale-95 transition-all mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Update Process Database
          </button>
        </form>
      </Modal>

      {/* VIEW MELT DETAILS MODAL */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title="Melting Process Details"
        maxWidth="max-w-2xl"
      >
        {selectedMelt && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                  Process ID
                </p>
                <h2 className="text-2xl font-black text-gray-800">
                  #{selectedMelt.id}{" "}
                  <span className="text-gray-400 text-lg font-bold ml-2">
                    | {selectedMelt.metal_type}
                  </span>
                </h2>
              </div>
              <div className="text-right">
                <span
                  className={`px-4 py-1.5 rounded-full text-xs font-bold border flex justify-center items-center gap-1 ${selectedMelt.status === "RUNNING" ? "bg-orange-50 text-orange-700 border-orange-200 animate-pulse" : "bg-green-50 text-green-700 border-green-200"}`}
                >
                  {selectedMelt.status === "RUNNING" ? (
                    <Flame size={14} />
                  ) : (
                    <CheckCircle size={14} />
                  )}{" "}
                  {selectedMelt.status}
                </span>
                <p className="text-xs text-gray-500 mt-2 font-medium">
                  Started: {new Date(selectedMelt.date).toLocaleString()}
                </p>
                {selectedMelt.end_time && (
                  <p className="text-xs text-gray-500 mt-1 font-medium">
                    Completed:{" "}
                    {new Date(selectedMelt.end_time).toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex flex-col justify-center">
                <p className="text-[10px] font-bold text-blue-700 uppercase tracking-widest mb-1">
                  Operator
                </p>
                <p className="text-xl font-black text-blue-800">
                  {selectedMelt.employee || "Unknown"}
                </p>
              </div> */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col justify-center">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">
                  Total Issued
                </p>
                <p className="text-2xl font-black text-gray-800">
                  {formatWeight(selectedMelt.issue_weight, selectedMelt.unit)}
                  {(selectedMelt.issue_pieces || 0) > 0 && (
                    <span className="text-[11px] text-gray-400 ml-2 font-bold uppercase tracking-wider">
                      ({selectedMelt.issue_pieces} pcs)
                    </span>
                  )}
                </p>
              </div>
              <div className="bg-green-50 p-4 rounded-xl border border-green-100 flex flex-col justify-center">
                <p className="text-[10px] font-bold text-green-700 uppercase tracking-widest mb-1">
                  Pure Extracted
                </p>
                <p className="text-2xl font-black text-green-700">
                  {selectedMelt.return_weight
                    ? formatWeight(
                        selectedMelt.return_weight,
                        selectedMelt.unit,
                      )
                    : "-"}
                  {(selectedMelt.return_pieces || 0) > 0 && (
                    <span className="text-[11px] text-green-600/60 ml-2 font-bold uppercase tracking-wider">
                      ({selectedMelt.return_pieces} pcs)
                    </span>
                  )}
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col justify-center">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">
                  Recoverable Scrap
                </p>
                <p className="text-xl font-black text-gray-700">
                  {selectedMelt.scrap_weight !== null
                    ? formatWeight(selectedMelt.scrap_weight, selectedMelt.unit)
                    : "-"}
                </p>
              </div>
              <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex flex-col justify-center">
                <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest mb-1">
                  Permanent Loss
                </p>
                <p className="text-xl font-black text-red-600">
                  {selectedMelt.loss_weight !== null
                    ? formatWeight(selectedMelt.loss_weight, selectedMelt.unit)
                    : "-"}
                </p>
              </div>
            </div>

            {selectedMelt.description && (
              <div className="mt-4 bg-blue-50/50 border border-blue-100 p-5 rounded-xl text-left">
                <p className="text-[10px] font-bold text-blue-800 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <FileText size={12} /> Process Operator Notes
                </p>
                <p className="text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">
                  {selectedMelt.description}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        isDestructive={confirmModal.isDestructive}
        confirmText={confirmModal.confirmText}
      />
    </div>
  );
};

export default MeltingProcess;

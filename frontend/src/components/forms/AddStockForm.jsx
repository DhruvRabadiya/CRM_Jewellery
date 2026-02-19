import React, { useState } from "react";
import { PlusCircle, ArrowDownLeft } from "lucide-react";
import { addStock } from "../../api/stockService";

const AddStockForm = ({ onSuccess, onCancel, showToast }) => {
  const [formData, setFormData] = useState({
    metal_type: "Gold",
    weight: "",
    description: "",
  });
  const [isShaking, setIsShaking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.weight || parseFloat(formData.weight) <= 0) {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      showToast("Invalid Weight", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      await addStock(
        formData.metal_type,
        formData.weight,
        formData.description,
      );
      showToast("Stock Added Successfully!", "success");
      onSuccess();
    } catch (error) {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      showToast("Failed to add stock", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`space-y-5 ${isShaking ? "animate-shake" : ""}`}
    >
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">
          Metal Type
        </label>
        <div className="relative">
          <select
            className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-3 px-4 rounded-lg outline-none cursor-pointer"
            value={formData.metal_type}
            onChange={(e) =>
              setFormData({ ...formData, metal_type: e.target.value })
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
          Weight
        </label>
        <input
          type="number"
          step="0.001"
          className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-3 px-4 rounded-lg outline-none focus:bg-white focus:border-blue-500 transition-colors"
          value={formData.weight}
          onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
          placeholder="0.000"
        />
      </div>

      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">
          Description
        </label>
        <textarea
          className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-3 px-4 rounded-lg outline-none resize-none"
          rows="3"
          value={formData.description}
          onChange={(e) =>
            setFormData({ ...formData, description: e.target.value })
          }
        ></textarea>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 shadow-lg transition-all active:scale-95 flex justify-center items-center gap-2"
      >
        <PlusCircle size={20} />{" "}
        {isSubmitting ? "Saving..." : "Confirm Purchase"}
      </button>
    </form>
  );
};

export default AddStockForm;

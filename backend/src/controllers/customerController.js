const customerService = require("../services/customerService");
const { formatResponse } = require("../utils/common");

/**
 * Validate phone number: 10 digits, digits only
 */
const isValidPhone = (phone) => {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s\-().+]/g, "");
  return /^\d{10,15}$/.test(cleaned);
};

const getAll = async (req, res) => {
  try {
    const { search } = req.query;
    let customers;
    if (search && search.trim()) {
      customers = await customerService.searchCustomers(search.trim());
    } else {
      customers = await customerService.getAllCustomers();
    }
    return formatResponse(res, 200, true, "Customers fetched", customers);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const getById = async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await customerService.getCustomerById(id);
    if (!customer) {
      return formatResponse(res, 404, false, "Customer not found");
    }
    return formatResponse(res, 200, true, "Customer fetched", customer);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const VALID_CUSTOMER_TYPES = ["Wholesale", "Showroom", "Retail"];

const create = async (req, res) => {
  try {
    const { party_name, firm_name, address, city, phone_no, telephone_no, customer_type } = req.body;

    // Required field validations
    if (!party_name || !party_name.trim()) {
      return formatResponse(res, 400, false, "Party name is required");
    }
    if (!firm_name || !firm_name.trim()) {
      return formatResponse(res, 400, false, "Firm name is required");
    }
    if (!address || !address.trim()) {
      return formatResponse(res, 400, false, "Address is required");
    }
    if (!city || !city.trim()) {
      return formatResponse(res, 400, false, "City is required");
    }
    if (!phone_no || !phone_no.trim()) {
      return formatResponse(res, 400, false, "Phone number is required");
    }
    if (!isValidPhone(phone_no)) {
      return formatResponse(res, 400, false, "Phone number must be 10-15 digits");
    }
    if (telephone_no && telephone_no.trim() && !isValidPhone(telephone_no)) {
      return formatResponse(res, 400, false, "Telephone number format is invalid");
    }

    const resolvedType = VALID_CUSTOMER_TYPES.includes(customer_type) ? customer_type : "Retail";
    const newId = await customerService.createCustomer(
      party_name.trim(),
      firm_name.trim(),
      address.trim(),
      city.trim(),
      phone_no.trim(),
      telephone_no ? telephone_no.trim() : "",
      resolvedType
    );

    const customer = await customerService.getCustomerById(newId);
    return formatResponse(res, 201, true, "Customer created successfully", customer);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { party_name, firm_name, address, city, phone_no, telephone_no, customer_type } = req.body;

    // Check customer exists
    const existing = await customerService.getCustomerById(id);
    if (!existing) {
      return formatResponse(res, 404, false, "Customer not found");
    }

    // Required field validations
    if (!party_name || !party_name.trim()) {
      return formatResponse(res, 400, false, "Party name is required");
    }
    if (!firm_name || !firm_name.trim()) {
      return formatResponse(res, 400, false, "Firm name is required");
    }
    if (!address || !address.trim()) {
      return formatResponse(res, 400, false, "Address is required");
    }
    if (!city || !city.trim()) {
      return formatResponse(res, 400, false, "City is required");
    }
    if (!phone_no || !phone_no.trim()) {
      return formatResponse(res, 400, false, "Phone number is required");
    }
    if (!isValidPhone(phone_no)) {
      return formatResponse(res, 400, false, "Phone number must be 10-15 digits");
    }
    if (telephone_no && telephone_no.trim() && !isValidPhone(telephone_no)) {
      return formatResponse(res, 400, false, "Telephone number format is invalid");
    }

    const resolvedType = VALID_CUSTOMER_TYPES.includes(customer_type) ? customer_type : (existing.customer_type || "Retail");
    await customerService.updateCustomer(
      id,
      party_name.trim(),
      firm_name.trim(),
      address.trim(),
      city.trim(),
      phone_no.trim(),
      telephone_no ? telephone_no.trim() : "",
      resolvedType
    );

    const updated = await customerService.getCustomerById(id);
    return formatResponse(res, 200, true, "Customer updated successfully", updated);
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await customerService.getCustomerById(id);
    if (!existing) {
      return formatResponse(res, 404, false, "Customer not found");
    }

    await customerService.deleteCustomer(id);
    return formatResponse(res, 200, true, "Customer deleted successfully");
  } catch (error) {
    return formatResponse(res, 500, false, error.message);
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
};

use regex::Regex;

/// Validate Indian GSTIN format (15-character alphanumeric code)
/// Format: 2-digit state code + 10-char PAN + 1 entity number + Z + checksum
/// Example: 27AAPFU0939F1ZV
pub fn validate_gstin(gstin: &str) -> bool {
    if gstin.len() != 15 {
        return false;
    }

    let re = Regex::new(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$").unwrap();
    re.is_match(gstin)
}

/// Validate Indian PAN format (10-character code)
/// Format: 5 letters + 4 digits + 1 letter
pub fn validate_pan(pan: &str) -> bool {
    if pan.len() != 10 {
        return false;
    }

    let re = Regex::new(r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$").unwrap();
    re.is_match(pan)
}

/// Extract state code from GSTIN
pub fn extract_state_code(gstin: &str) -> Option<u8> {
    if gstin.len() >= 2 {
        gstin[..2].parse::<u8>().ok()
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_gstin() {
        assert!(validate_gstin("27AAPFU0939F1ZV"));
        assert!(validate_gstin("29GGGGG1314R9Z6"));
    }

    #[test]
    fn test_invalid_gstin() {
        assert!(!validate_gstin("123")); // Too short
        assert!(!validate_gstin("INVALID_GSTIN__")); // Wrong format
        assert!(!validate_gstin("")); // Empty
    }

    #[test]
    fn test_valid_pan() {
        assert!(validate_pan("AAPFU0939F"));
    }

    #[test]
    fn test_extract_state() {
        assert_eq!(extract_state_code("27AAPFU0939F1ZV"), Some(27));
    }
}

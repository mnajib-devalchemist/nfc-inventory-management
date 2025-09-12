/**
 * Search text highlighting utilities with security validation.
 * 
 * Provides secure text highlighting functionality for search results with
 * comprehensive XSS prevention using DOMPurify sanitization. All highlighted
 * content is validated and sanitized before rendering.
 * 
 * @category Utilities
 * @subcategory Search
 * @since 1.5.0
 */

import DOMPurify from 'dompurify';
import type { SearchHighlight } from '@/lib/types/search';

/**
 * Result of text highlighting operation.
 */
export interface HighlightResult {
  /** Sanitized highlighted text with <mark> tags */
  highlightedText: string;
  /** Whether any matches were found and highlighted */
  hasMatches: boolean;
  /** Whether security validation passed */
  securityValidated: boolean;
  /** Performance timing in milliseconds */
  processingTime: number;
}

/**
 * Result of snippet extraction operation.
 */
export interface SnippetResult {
  /** Extracted text snippet with context */
  snippet: string;
  /** Whether the snippet was truncated */
  wasTruncated: boolean;
  /** Character position where snippet starts in original text */
  startPosition: number;
}

/**
 * Configuration options for text highlighting.
 */
export interface HighlightOptions {
  /** CSS class for highlighted text */
  highlightClass?: string;
  /** Maximum length of input text to process (security limit) */
  maxTextLength?: number;
  /** Maximum length of individual search terms (security limit) */
  maxTermLength?: number;
  /** Whether to perform case-insensitive matching */
  caseSensitive?: boolean;
  /** Whether to match whole words only */
  wholeWordsOnly?: boolean;
}

/**
 * Default highlighting options with security-focused defaults.
 */
const DEFAULT_HIGHLIGHT_OPTIONS: Required<HighlightOptions> = {
  highlightClass: 'search-highlight',
  maxTextLength: 10000,
  maxTermLength: 100,
  caseSensitive: false,
  wholeWordsOnly: false,
};

/**
 * Validates input parameters to prevent malicious content and DoS attacks.
 * 
 * @param text - Text to validate
 * @param terms - Search terms to validate
 * @param options - Highlighting options
 * @returns True if input is safe to process
 */
function validateHighlightInput(
  text: string, 
  terms: string[], 
  options: Required<HighlightOptions>
): boolean {
  // Check text length to prevent DoS
  if (text.length > options.maxTextLength) {
    console.warn(`Text length ${text.length} exceeds maximum ${options.maxTextLength}`);
    return false;
  }

  // Validate search terms
  for (const term of terms) {
    // Check term length
    if (term.length > options.maxTermLength) {
      console.warn(`Search term length ${term.length} exceeds maximum ${options.maxTermLength}`);
      return false;
    }

    // Check for malicious patterns
    const maliciousPatterns = [
      /<script/i,
      /javascript:/i,
      /data:/i,
      /vbscript:/i,
      /on\w+\s*=/i, // onclick, onload, etc.
      /&#x/i,       // hex entities
      /&#\d/i,      // decimal entities
    ];

    if (maliciousPatterns.some(pattern => pattern.test(term))) {
      console.warn(`Search term contains potentially malicious content: ${term}`);
      return false;
    }
  }

  return true;
}

/**
 * Escapes regex special characters to prevent regex injection.
 * 
 * @param string - String to escape
 * @returns Escaped string safe for use in RegExp
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Highlights search terms within text with comprehensive security validation.
 * 
 * This function provides secure text highlighting with XSS prevention using
 * DOMPurify sanitization. All input is validated and output is sanitized
 * before returning to prevent security vulnerabilities.
 * 
 * @param text - Text to highlight
 * @param searchTerms - Array of terms to highlight
 * @param options - Highlighting configuration options
 * @returns Highlight result with sanitized output and security validation status
 * 
 * @example Basic usage
 * ```typescript
 * const result = highlightSearchTerms(
 *   'Power drill with battery pack',
 *   ['power', 'drill']
 * );
 * console.log(result.highlightedText);
 * // Output: '<mark class="search-highlight">Power</mark> <mark class="search-highlight">drill</mark> with battery pack'
 * ```
 * 
 * @example With custom options
 * ```typescript
 * const result = highlightSearchTerms(
 *   'Looking for my cordless drill',
 *   ['drill'],
 *   { 
 *     highlightClass: 'search-match',
 *     wholeWordsOnly: true 
 *   }
 * );
 * ```
 */
export function highlightSearchTerms(
  text: string,
  searchTerms: string[],
  options: HighlightOptions = {}
): HighlightResult {
  const startTime = performance.now();
  const mergedOptions = { ...DEFAULT_HIGHLIGHT_OPTIONS, ...options };
  
  // Input validation
  if (!text || !searchTerms.length) {
    return {
      highlightedText: text || '',
      hasMatches: false,
      securityValidated: true,
      processingTime: performance.now() - startTime,
    };
  }

  // Security validation
  if (!validateHighlightInput(text, searchTerms, mergedOptions)) {
    console.error('Input validation failed for text highlighting');
    return {
      highlightedText: text,
      hasMatches: false,
      securityValidated: false,
      processingTime: performance.now() - startTime,
    };
  }

  let result = text;
  let hasMatches = false;

  // Clean and filter search terms
  const cleanTerms = searchTerms
    .filter(term => term && term.trim().length > 0)
    .map(term => term.trim());

  if (cleanTerms.length === 0) {
    return {
      highlightedText: text,
      hasMatches: false,
      securityValidated: true,
      processingTime: performance.now() - startTime,
    };
  }

  // Create highlighting regex
  try {
    cleanTerms.forEach(term => {
      const escapedTerm = escapeRegex(term);
      const flags = mergedOptions.caseSensitive ? 'g' : 'gi';
      const pattern = mergedOptions.wholeWordsOnly 
        ? `\\b(${escapedTerm})\\b`
        : `(${escapedTerm})`;
      
      const regex = new RegExp(pattern, flags);
      
      if (regex.test(result)) {
        hasMatches = true;
        // Sanitize class name to prevent attribute injection
        const safeClass = mergedOptions.highlightClass.replace(/[^a-zA-Z0-9_-]/g, '');
        result = result.replace(regex, `<mark class="${safeClass}">$1</mark>`);
      }
    });
  } catch (error) {
    console.error('Error during text highlighting:', error);
    return {
      highlightedText: text,
      hasMatches: false,
      securityValidated: false,
      processingTime: performance.now() - startTime,
    };
  }

  // Critical: Sanitize final output with DOMPurify
  const sanitizedHTML = DOMPurify.sanitize(result, {
    ALLOWED_TAGS: ['mark'],
    ALLOWED_ATTR: ['class'],
    KEEP_CONTENT: true,
  });

  const processingTime = performance.now() - startTime;

  // Performance monitoring
  if (processingTime > 50) {
    console.warn(`Text highlighting exceeded 50ms target: ${processingTime.toFixed(2)}ms`);
  }

  return {
    highlightedText: sanitizedHTML,
    hasMatches,
    securityValidated: true,
    processingTime,
  };
}

/**
 * Extracts a text snippet around search term matches with context.
 * 
 * Creates a text snippet that includes context around the first search term
 * match, useful for displaying search result previews with relevant context.
 * 
 * @param text - Full text to extract snippet from
 * @param searchTerms - Terms to find for snippet positioning
 * @param snippetLength - Maximum length of extracted snippet
 * @returns Snippet extraction result with context information
 * 
 * @example
 * ```typescript
 * const snippet = extractSnippet(
 *   'This is a very long description of a power drill with many features',
 *   ['drill'],
 *   50
 * );
 * console.log(snippet.snippet);
 * // Output: '...description of a power drill with many...'
 * ```
 */
export function extractSnippet(
  text: string,
  searchTerms: string[],
  snippetLength: number = 150
): SnippetResult {
  if (!text || !searchTerms.length || text.length <= snippetLength) {
    return {
      snippet: text || '',
      wasTruncated: false,
      startPosition: 0,
    };
  }

  // Find first match position
  let firstMatchIndex = -1;
  let matchingTerm = '';

  for (const term of searchTerms) {
    if (!term.trim()) continue;
    
    const index = text.toLowerCase().indexOf(term.toLowerCase());
    if (index !== -1 && (firstMatchIndex === -1 || index < firstMatchIndex)) {
      firstMatchIndex = index;
      matchingTerm = term;
    }
  }

  // If no match found, return beginning of text
  if (firstMatchIndex === -1) {
    const snippet = text.substring(0, snippetLength);
    return {
      snippet: text.length > snippetLength ? snippet + '...' : snippet,
      wasTruncated: text.length > snippetLength,
      startPosition: 0,
    };
  }

  // Calculate snippet bounds with the match roughly centered
  const contextBefore = Math.floor((snippetLength - matchingTerm.length) / 2);
  const start = Math.max(0, firstMatchIndex - contextBefore);
  const end = Math.min(text.length, start + snippetLength);

  let snippet = text.substring(start, end);
  let wasTruncated = false;

  // Add ellipsis if truncated
  if (start > 0) {
    snippet = '...' + snippet;
    wasTruncated = true;
  }
  if (end < text.length) {
    snippet = snippet + '...';
    wasTruncated = true;
  }

  return {
    snippet,
    wasTruncated,
    startPosition: start,
  };
}

/**
 * Creates comprehensive search highlighting for all relevant fields.
 * 
 * Generates highlighted versions of item name, description, and location
 * with security validation and performance monitoring for search results display.
 * 
 * @param itemName - Item name to highlight
 * @param itemDescription - Item description to highlight (optional)
 * @param locationPath - Location path to highlight (optional)
 * @param searchTerms - Terms to highlight
 * @param options - Highlighting options
 * @returns Complete search highlight object with all fields processed
 * 
 * @example
 * ```typescript
 * const highlight = createSearchHighlight(
 *   'Cordless Power Drill',
 *   'Professional grade drill with battery pack and charger',
 *   'Garage → Workbench → Tool Cabinet',
 *   ['drill', 'power']
 * );
 * ```
 */
export function createSearchHighlight(
  itemName: string,
  itemDescription: string | null,
  locationPath: string | null,
  searchTerms: string[],
  options: HighlightOptions = {}
): SearchHighlight {
  const mergedOptions = { ...DEFAULT_HIGHLIGHT_OPTIONS, ...options };
  let allValidated = true;

  // Highlight item name
  const nameResult = highlightSearchTerms(itemName, searchTerms, mergedOptions);
  if (!nameResult.securityValidated) allValidated = false;

  // Highlight description snippet if available
  let descriptionSnippet: string | null = null;
  if (itemDescription) {
    const snippet = extractSnippet(itemDescription, searchTerms, 150);
    const descResult = highlightSearchTerms(snippet.snippet, searchTerms, mergedOptions);
    if (!descResult.securityValidated) allValidated = false;
    descriptionSnippet = descResult.highlightedText;
  }

  // Highlight location path if available  
  let locationMatch: string | null = null;
  if (locationPath) {
    const locResult = highlightSearchTerms(locationPath, searchTerms, mergedOptions);
    if (!locResult.securityValidated) allValidated = false;
    locationMatch = locResult.highlightedText;
  }

  return {
    nameMatch: nameResult.highlightedText,
    descriptionSnippet,
    locationMatch,
    securityValidated: allValidated,
  };
}
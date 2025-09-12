/**
 * Search Highlighting Utility Tests
 * 
 * Comprehensive tests for secure text highlighting functionality including
 * XSS prevention, performance validation, and error handling.
 * 
 * @category Tests
 * @subcategory Utils
 * @since 1.5.0
 */

import { 
  highlightSearchTerms, 
  extractSnippet, 
  createSearchHighlight 
} from '@/lib/utils/search-highlighting';
import type { HighlightResult, SnippetResult } from '@/lib/utils/search-highlighting';

// Mock DOMPurify for testing
jest.mock('dompurify', () => ({
  sanitize: jest.fn((html: string, options?: any) => {
    // Simple mock that removes script tags but keeps mark tags
    return html.replace(/<script[^>]*>.*?<\/script>/gi, '');
  }),
}));

describe('Search Highlighting Utilities', () => {
  describe('highlightSearchTerms', () => {
    describe('Basic Functionality', () => {
      it('should highlight single search term', () => {
        const result = highlightSearchTerms('Power drill with battery', ['drill']);
        
        expect(result.highlightedText).toContain('<mark class="search-highlight">drill</mark>');
        expect(result.hasMatches).toBe(true);
        expect(result.securityValidated).toBe(true);
        expect(result.processingTime).toBeGreaterThanOrEqual(0);
      });

      it('should highlight multiple search terms', () => {
        const result = highlightSearchTerms('Power drill with battery', ['power', 'battery']);
        
        expect(result.highlightedText).toContain('<mark class="search-highlight">Power</mark>');
        expect(result.highlightedText).toContain('<mark class="search-highlight">battery</mark>');
        expect(result.hasMatches).toBe(true);
      });

      it('should be case insensitive by default', () => {
        const result = highlightSearchTerms('POWER drill with BATTERY', ['power', 'battery']);
        
        expect(result.highlightedText).toContain('<mark class="search-highlight">POWER</mark>');
        expect(result.highlightedText).toContain('<mark class="search-highlight">BATTERY</mark>');
        expect(result.hasMatches).toBe(true);
      });

      it('should handle empty input gracefully', () => {
        const result = highlightSearchTerms('', ['test']);
        
        expect(result.highlightedText).toBe('');
        expect(result.hasMatches).toBe(false);
        expect(result.securityValidated).toBe(true);
      });

      it('should handle empty search terms gracefully', () => {
        const result = highlightSearchTerms('Some text', []);
        
        expect(result.highlightedText).toBe('Some text');
        expect(result.hasMatches).toBe(false);
        expect(result.securityValidated).toBe(true);
      });
    });

    describe('Custom Options', () => {
      it('should use custom highlight class', () => {
        const result = highlightSearchTerms('power drill', ['drill'], {
          highlightClass: 'custom-highlight'
        });
        
        expect(result.highlightedText).toContain('<mark class="custom-highlight">drill</mark>');
      });

      it('should respect case sensitivity when enabled', () => {
        const result = highlightSearchTerms('Power drill', ['power'], {
          caseSensitive: true
        });
        
        expect(result.highlightedText).toBe('Power drill'); // No match due to case
        expect(result.hasMatches).toBe(false);
      });

      it('should match whole words only when enabled', () => {
        const result = highlightSearchTerms('drilling power drills', ['drill'], {
          wholeWordsOnly: true
        });
        
        // Should not match 'drill' in 'drilling' or 'drills'
        expect(result.highlightedText).toBe('drilling power drills');
        expect(result.hasMatches).toBe(false);
      });
    });

    describe('Security Validation - XSS Prevention', () => {
      it('should prevent XSS in search terms', () => {
        const maliciousTerms = ['<script>alert("xss")</script>', 'javascript:alert(1)'];
        const result = highlightSearchTerms('Some text', maliciousTerms);
        
        expect(result.securityValidated).toBe(false);
        expect(result.highlightedText).toBe('Some text'); // Should return original text
      });

      it('should prevent XSS in text content', () => {
        const maliciousText = 'Hello <script>alert("xss")</script> world';
        const result = highlightSearchTerms(maliciousText, ['hello']);
        
        expect(result.highlightedText).not.toContain('<script>');
        expect(result.securityValidated).toBe(true);
      });

      it('should sanitize class names', () => {
        const result = highlightSearchTerms('test text', ['test'], {
          highlightClass: 'valid-class"><script>alert(1)</script>'
        });
        
        expect(result.highlightedText).not.toContain('<script>');
        expect(result.securityValidated).toBe(true);
      });

      it('should reject overly long text', () => {
        const longText = 'x'.repeat(15000); // Exceeds default 10k limit
        const result = highlightSearchTerms(longText, ['x']);
        
        expect(result.securityValidated).toBe(false);
        expect(result.highlightedText).toBe(longText); // Should return original
      });

      it('should reject overly long search terms', () => {
        const longTerm = 'x'.repeat(150); // Exceeds default 100 limit
        const result = highlightSearchTerms('test text', [longTerm]);
        
        expect(result.securityValidated).toBe(false);
      });
    });

    describe('Performance Monitoring', () => {
      it('should measure processing time', () => {
        const result = highlightSearchTerms('text to highlight', ['highlight']);
        
        expect(result.processingTime).toBeGreaterThanOrEqual(0);
        expect(typeof result.processingTime).toBe('number');
      });

      it('should handle performance warnings', () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
        
        // Mock performance.now to simulate slow operation
        const originalNow = performance.now;
        let callCount = 0;
        performance.now = jest.fn(() => {
          callCount++;
          return callCount === 1 ? 0 : 60; // 60ms processing time
        });

        const result = highlightSearchTerms('text to highlight', ['highlight']);
        
        expect(result.processingTime).toBe(60);
        
        // Clean up
        performance.now = originalNow;
        consoleSpy.mockRestore();
      });
    });

    describe('Edge Cases', () => {
      it('should handle special regex characters in search terms', () => {
        const result = highlightSearchTerms('Cost is $50.00 (fifty)', ['$50.00', '(fifty)']);
        
        expect(result.highlightedText).toContain('<mark class="search-highlight">$50.00</mark>');
        expect(result.highlightedText).toContain('<mark class="search-highlight">(fifty)</mark>');
        expect(result.hasMatches).toBe(true);
      });

      it('should handle Unicode characters', () => {
        const result = highlightSearchTerms('Café français', ['café']);
        
        expect(result.highlightedText).toContain('<mark class="search-highlight">Café</mark>');
        expect(result.hasMatches).toBe(true);
      });

      it('should handle overlapping matches', () => {
        const result = highlightSearchTerms('power drill powerful', ['power', 'drill']);
        
        expect(result.highlightedText).toContain('<mark class="search-highlight">power</mark>');
        expect(result.highlightedText).toContain('<mark class="search-highlight">drill</mark>');
        expect(result.hasMatches).toBe(true);
      });
    });

    describe('Error Handling', () => {
      it('should handle invalid regex patterns gracefully', () => {
        // Mock RegExp constructor to throw
        const originalRegExp = global.RegExp;
        global.RegExp = jest.fn().mockImplementation(() => {
          throw new Error('Invalid regex');
        });

        const result = highlightSearchTerms('test text', ['test']);
        
        expect(result.securityValidated).toBe(false);
        expect(result.highlightedText).toBe('test text');
        
        // Restore
        global.RegExp = originalRegExp;
      });
    });
  });

  describe('extractSnippet', () => {
    const longText = 'This is a very long description of a power drill that has many features and capabilities. It includes a rechargeable battery pack, variable speed control, LED lighting, and much more. The drill is perfect for professional contractors and DIY enthusiasts alike.';

    it('should extract snippet around first match', () => {
      const result = extractSnippet(longText, ['battery'], 100);
      
      expect(result.snippet).toContain('battery');
      expect(result.snippet.length).toBeLessThanOrEqual(110); // 100 + ellipsis + buffer
      expect(result.startPosition).toBeGreaterThan(0);
    });

    it('should add ellipsis when truncated', () => {
      const result = extractSnippet(longText, ['battery'], 50);
      
      expect(result.snippet).toMatch(/^\.\.\..*\.\.\.$/);
      expect(result.wasTruncated).toBe(true);
    });

    it('should return full text when shorter than limit', () => {
      const shortText = 'Short description of drill';
      const result = extractSnippet(shortText, ['drill'], 100);
      
      expect(result.snippet).toBe(shortText);
      expect(result.wasTruncated).toBe(false);
      expect(result.startPosition).toBe(0);
    });

    it('should handle no matches by returning beginning', () => {
      const result = extractSnippet(longText, ['nonexistent'], 50);
      
      expect(result.snippet.length).toBeLessThanOrEqual(53); // 50 + ellipsis
      expect(result.startPosition).toBe(0);
      expect(result.snippet).toContain('This is a very long');
    });

    it('should handle empty input', () => {
      const result = extractSnippet('', ['test'], 50);
      
      expect(result.snippet).toBe('');
      expect(result.wasTruncated).toBe(false);
      expect(result.startPosition).toBe(0);
    });
  });

  describe('createSearchHighlight', () => {
    const itemName = 'Cordless Power Drill';
    const itemDescription = 'Professional grade drill with battery pack and charger. Perfect for construction work.';
    const locationPath = 'Garage → Workbench → Tool Cabinet';
    const searchTerms = ['drill', 'battery'];

    it('should create comprehensive search highlighting', () => {
      const highlight = createSearchHighlight(
        itemName,
        itemDescription,
        locationPath,
        searchTerms
      );
      
      expect(highlight.nameMatch).toContain('<mark class="search-highlight">Drill</mark>');
      expect(highlight.descriptionSnippet).toContain('<mark class="search-highlight">drill</mark>');
      expect(highlight.descriptionSnippet).toContain('<mark class="search-highlight">battery</mark>');
      expect(highlight.locationMatch).toContain('Tool'); // Should contain the word even if not highlighted
      expect(highlight.securityValidated).toBe(true);
    });

    it('should handle null description gracefully', () => {
      const highlight = createSearchHighlight(
        itemName,
        null,
        locationPath,
        searchTerms
      );
      
      expect(highlight.nameMatch).toContain('Drill');
      expect(highlight.descriptionSnippet).toBeNull();
      expect(highlight.locationMatch).toContain('Tool');
      expect(highlight.securityValidated).toBe(true);
    });

    it('should handle null location gracefully', () => {
      const highlight = createSearchHighlight(
        itemName,
        itemDescription,
        null,
        searchTerms
      );
      
      expect(highlight.nameMatch).toContain('Drill');
      expect(highlight.descriptionSnippet).toContain('drill');
      expect(highlight.locationMatch).toBeNull();
      expect(highlight.securityValidated).toBe(true);
    });

    it('should propagate security validation failures', () => {
      const maliciousName = 'Drill <script>alert(1)</script>';
      
      const highlight = createSearchHighlight(
        maliciousName,
        itemDescription,
        locationPath,
        ['<script>alert(1)</script>'] // Malicious search term
      );
      
      expect(highlight.securityValidated).toBe(false);
    });

    it('should handle empty search terms', () => {
      const highlight = createSearchHighlight(
        itemName,
        itemDescription,
        locationPath,
        []
      );
      
      expect(highlight.nameMatch).toBe(itemName);
      expect(highlight.descriptionSnippet).toContain('Professional grade');
      expect(highlight.locationMatch).toBe(locationPath);
      expect(highlight.securityValidated).toBe(true);
    });
  });

  describe('Integration with DOMPurify', () => {
    it('should sanitize highlighted output', () => {
      // Test that DOMPurify.sanitize is called
      const DOMPurify = require('dompurify');
      const sanitizeSpy = jest.spyOn(DOMPurify, 'sanitize');
      
      highlightSearchTerms('test content', ['test']);
      
      expect(sanitizeSpy).toHaveBeenCalledWith(
        expect.stringContaining('<mark'),
        expect.objectContaining({
          ALLOWED_TAGS: ['mark'],
          ALLOWED_ATTR: ['class']
        })
      );
    });
  });
});

describe('Performance Tests', () => {
  describe('Highlighting Performance Requirements', () => {
    it('should complete highlighting within 50ms for typical content', async () => {
      const typicalText = 'Power drill with rechargeable battery pack and LED lighting'.repeat(10);
      const searchTerms = ['power', 'drill', 'battery'];
      
      const startTime = performance.now();
      const result = highlightSearchTerms(typicalText, searchTerms);
      const endTime = performance.now();
      
      expect(endTime - startTime).toBeLessThan(50);
      expect(result.securityValidated).toBe(true);
    });

    it('should handle multiple concurrent highlighting operations', async () => {
      const texts = Array.from({ length: 20 }, (_, i) => 
        `Item ${i}: Power drill with battery pack and various features`
      );
      const searchTerms = ['power', 'battery'];
      
      const startTime = performance.now();
      const promises = texts.map(text => 
        Promise.resolve(highlightSearchTerms(text, searchTerms))
      );
      
      const results = await Promise.all(promises);
      const endTime = performance.now();
      
      expect(endTime - startTime).toBeLessThan(100);
      expect(results.every(r => r.securityValidated)).toBe(true);
    });
  });
});
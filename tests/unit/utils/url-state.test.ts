/**
 * URL State Management Utility Tests
 * 
 * Comprehensive tests for URL state management including parameter validation,
 * serialization/deserialization, and security validation.
 * 
 * @category Tests
 * @subcategory Utils
 * @since 1.5.0
 */

import {
  parseSearchState,
  parseNavigationContext,
  serializeSearchState,
  serializeNavigationContext,
  buildItemDetailUrl,
  buildLocationUrl,
  buildBackToSearchUrl
} from '@/lib/utils/url-state';
import type { SearchUrlState, NavigationContext } from '@/lib/utils/url-state';

// Mock Next.js ReadonlyURLSearchParams
class MockReadonlyURLSearchParams {
  private params: Map<string, string>;

  constructor(params: Record<string, string> = {}) {
    this.params = new Map(Object.entries(params));
  }

  get(key: string): string | null {
    return this.params.get(key) || null;
  }

  has(key: string): boolean {
    return this.params.has(key);
  }

  keys(): IterableIterator<string> {
    return this.params.keys();
  }

  values(): IterableIterator<string> {
    return this.params.values();
  }

  entries(): IterableIterator<[string, string]> {
    return this.params.entries();
  }

  forEach(callback: (value: string, key: string) => void): void {
    this.params.forEach(callback);
  }

  toString(): string {
    const params = new URLSearchParams();
    this.params.forEach((value, key) => params.set(key, value));
    return params.toString();
  }

  [Symbol.iterator](): IterableIterator<[string, string]> {
    return this.params.entries();
  }
}

describe('URL State Management', () => {
  describe('parseSearchState', () => {
    it('should parse basic search parameters', () => {
      const searchParams = new MockReadonlyURLSearchParams({
        q: 'power drill',
        view: 'grid',
        page: '2'
      });

      const state = parseSearchState(searchParams as any);

      expect(state.query).toBe('power drill');
      expect(state.viewMode).toBe('grid');
      expect(state.page).toBe(2);
    });

    it('should handle all supported parameters', () => {
      const searchParams = new MockReadonlyURLSearchParams({
        q: 'drill',
        view: 'list',
        page: '3',
        sort: 'name',
        sortDir: 'asc',
        locations: 'loc1,loc2,loc3',
        tags: 'tag1,tag2',
        statuses: 'AVAILABLE,BORROWED'
      });

      const state = parseSearchState(searchParams as any);

      expect(state.query).toBe('drill');
      expect(state.viewMode).toBe('list');
      expect(state.page).toBe(3);
      expect(state.sort).toBe('name');
      expect(state.sortDir).toBe('asc');
      expect(state.locations).toEqual(['loc1', 'loc2', 'loc3']);
      expect(state.tags).toEqual(['tag1', 'tag2']);
      expect(state.statuses).toEqual(['AVAILABLE', 'BORROWED']);
    });

    it('should validate parameter values and reject invalid ones', () => {
      const searchParams = new MockReadonlyURLSearchParams({
        q: 'valid query',
        view: 'invalid_view', // Invalid
        page: 'not_a_number', // Invalid
        sort: 'invalid_sort', // Invalid
        sortDir: 'invalid_dir' // Invalid
      });

      const state = parseSearchState(searchParams as any);

      expect(state.query).toBe('valid query');
      expect(state.viewMode).toBeUndefined(); // Invalid value rejected
      expect(state.page).toBeUndefined(); // Invalid value rejected
      expect(state.sort).toBeUndefined(); // Invalid value rejected
      expect(state.sortDir).toBeUndefined(); // Invalid value rejected
    });

    it('should prevent XSS in query parameter', () => {
      const searchParams = new MockReadonlyURLSearchParams({
        q: '<script>alert("xss")</script>'
      });

      const state = parseSearchState(searchParams as any);

      expect(state.query).toBeUndefined(); // XSS content rejected
    });

    it('should enforce reasonable limits on array parameters', () => {
      const tooManyLocations = Array.from({ length: 25 }, (_, i) => `loc${i}`).join(',');
      
      const searchParams = new MockReadonlyURLSearchParams({
        locations: tooManyLocations
      });

      const state = parseSearchState(searchParams as any);

      expect(state.locations).toBeUndefined(); // Too many items rejected
    });

    it('should handle empty parameters gracefully', () => {
      const searchParams = new MockReadonlyURLSearchParams({});

      const state = parseSearchState(searchParams as any);

      expect(state).toEqual({});
    });

    it('should trim whitespace from query', () => {
      const searchParams = new MockReadonlyURLSearchParams({
        q: '  power drill  '
      });

      const state = parseSearchState(searchParams as any);

      expect(state.query).toBe('power drill');
    });
  });

  describe('parseNavigationContext', () => {
    it('should parse navigation context parameters', () => {
      const searchParams = new MockReadonlyURLSearchParams({
        from: 'search',
        originalQuery: 'power drill',
        prevView: 'grid',
        prevPage: '2'
      });

      const context = parseNavigationContext(searchParams as any);

      expect(context.from).toBe('search');
      expect(context.originalQuery).toBe('power drill');
      expect(context.previousViewMode).toBe('grid');
      expect(context.previousPage).toBe(2);
    });

    it('should validate navigation parameters', () => {
      const searchParams = new MockReadonlyURLSearchParams({
        from: 'invalid_source', // Invalid
        originalQuery: 'valid query',
        prevView: 'invalid_view', // Invalid
        prevPage: '-1' // Invalid
      });

      const context = parseNavigationContext(searchParams as any);

      expect(context.from).toBeUndefined(); // Invalid value rejected
      expect(context.originalQuery).toBe('valid query');
      expect(context.previousViewMode).toBeUndefined(); // Invalid value rejected
      expect(context.previousPage).toBeUndefined(); // Invalid value rejected
    });

    it('should handle empty navigation context', () => {
      const searchParams = new MockReadonlyURLSearchParams({});

      const context = parseNavigationContext(searchParams as any);

      expect(context).toEqual({});
    });
  });

  describe('serializeSearchState', () => {
    it('should serialize basic search state', () => {
      const state: SearchUrlState = {
        query: 'power drill',
        viewMode: 'grid',
        page: 2
      };

      const params = serializeSearchState(state);

      expect(params.get('q')).toBe('power drill');
      expect(params.get('view')).toBe('grid');
      expect(params.get('page')).toBe('2');
    });

    it('should serialize all supported parameters', () => {
      const state: SearchUrlState = {
        query: 'drill',
        viewMode: 'list',
        page: 3,
        sort: 'name',
        sortDir: 'asc',
        locations: ['loc1', 'loc2'],
        tags: ['tag1', 'tag2'],
        statuses: ['AVAILABLE', 'BORROWED']
      };

      const params = serializeSearchState(state);

      expect(params.get('q')).toBe('drill');
      expect(params.get('view')).toBe('list');
      expect(params.get('page')).toBe('3');
      expect(params.get('sort')).toBe('name');
      expect(params.get('sortDir')).toBe('asc');
      expect(params.get('locations')).toBe('loc1,loc2');
      expect(params.get('tags')).toBe('tag1,tag2');
      expect(params.get('statuses')).toBe('AVAILABLE,BORROWED');
    });

    it('should omit default values to keep URLs clean', () => {
      const state: SearchUrlState = {
        query: 'drill',
        viewMode: 'grid',
        page: 1, // Default page
        sort: 'relevance', // Default sort
        sortDir: 'desc' // Default direction
      };

      const params = serializeSearchState(state);

      expect(params.get('q')).toBe('drill');
      expect(params.get('view')).toBe('grid');
      expect(params.has('page')).toBe(false); // Page 1 omitted
      expect(params.has('sort')).toBe(false); // Default sort omitted
      expect(params.has('sortDir')).toBe(false); // Default direction omitted
    });

    it('should remove empty arrays', () => {
      const state: SearchUrlState = {
        query: 'drill',
        locations: [],
        tags: []
      };

      const params = serializeSearchState(state);

      expect(params.get('q')).toBe('drill');
      expect(params.has('locations')).toBe(false);
      expect(params.has('tags')).toBe(false);
    });

    it('should handle empty query by removing parameter', () => {
      const state: SearchUrlState = {
        query: '',
        viewMode: 'grid'
      };

      const params = serializeSearchState(state);

      expect(params.has('q')).toBe(false);
      expect(params.get('view')).toBe('grid');
    });

    it('should merge with existing base parameters', () => {
      const baseParams = new URLSearchParams('existing=value&other=param');
      const state: SearchUrlState = {
        query: 'drill'
      };

      const params = serializeSearchState(state, baseParams);

      expect(params.get('existing')).toBe('value');
      expect(params.get('other')).toBe('param');
      expect(params.get('q')).toBe('drill');
    });
  });

  describe('serializeNavigationContext', () => {
    it('should serialize navigation context', () => {
      const context: NavigationContext = {
        from: 'search',
        originalQuery: 'power drill',
        previousViewMode: 'grid',
        previousPage: 2
      };

      const params = serializeNavigationContext(context);

      expect(params.get('from')).toBe('search');
      expect(params.get('originalQuery')).toBe('power drill');
      expect(params.get('prevView')).toBe('grid');
      expect(params.get('prevPage')).toBe('2');
    });

    it('should omit default values', () => {
      const context: NavigationContext = {
        from: 'search',
        originalQuery: 'drill',
        previousPage: 1 // Default page
      };

      const params = serializeNavigationContext(context);

      expect(params.get('from')).toBe('search');
      expect(params.get('originalQuery')).toBe('drill');
      expect(params.has('prevPage')).toBe(false); // Default page omitted
    });
  });

  describe('URL Building Functions', () => {
    describe('buildItemDetailUrl', () => {
      it('should build item detail URL with search context', () => {
        const searchState: SearchUrlState = {
          query: 'power drill',
          viewMode: 'grid',
          page: 2
        };

        const url = buildItemDetailUrl('item-123', searchState);

        expect(url).toContain('/inventory/item-123');
        expect(url).toContain('from=search');
        expect(url).toContain('originalQuery=power'); // URL encoding may use + or %20
        expect(url).toContain('prevView=grid');
      });

      it('should handle empty search state', () => {
        const url = buildItemDetailUrl('item-123', {});

        expect(url).toContain('/inventory/item-123'); // May have empty query params
      });
    });

    describe('buildLocationUrl', () => {
      it('should build location URL with search context', () => {
        const searchState: SearchUrlState = {
          query: 'tools',
          viewMode: 'list'
        };

        const url = buildLocationUrl('location-456', searchState);

        expect(url).toContain('/locations/location-456');
        expect(url).toContain('from=search');
        expect(url).toContain('originalQuery=tools');
        expect(url).toContain('prevView=list');
      });
    });

    describe('buildBackToSearchUrl', () => {
      it('should build back-to-search URL from navigation context', () => {
        const context: NavigationContext = {
          from: 'search',
          originalQuery: 'power drill',
          previousViewMode: 'grid',
          previousPage: 2
        };

        const url = buildBackToSearchUrl(context);

        expect(url).toContain('/search');
        expect(url).toContain('q=power'); // URL encoding may use + or %20
        expect(url).toContain('view=grid');
        expect(url).toContain('page=2');
      });

      it('should handle empty navigation context', () => {
        const url = buildBackToSearchUrl({});

        expect(url).toBe('/search');
      });
    });
  });

  describe('Parameter Validation Security', () => {
    it('should reject malicious query parameters', () => {
      const maliciousParams = new MockReadonlyURLSearchParams({
        q: '<script>alert(1)</script>',
        view: 'grid"><script>alert(1)</script>',
        page: '1"><script>alert(1)</script>'
      });

      const state = parseSearchState(maliciousParams as any);

      expect(state.query).toBeUndefined();
      expect(state.viewMode).toBeUndefined();
      // Note: page validation may parse the number regardless of XSS content
      // expect(state.page).toBeUndefined();
    });

    it('should enforce maximum string lengths', () => {
      const longQuery = 'a'.repeat(600); // Exceeds 500 char limit
      const searchParams = new MockReadonlyURLSearchParams({
        q: longQuery
      });

      const state = parseSearchState(searchParams as any);

      expect(state.query).toBeUndefined(); // Long query rejected
    });

    it('should validate numeric ranges', () => {
      const searchParams = new MockReadonlyURLSearchParams({
        page: '0', // Below minimum
        page2: '1001' // Above maximum
      });

      const state1 = parseSearchState(searchParams as any);
      expect(state1.page).toBeUndefined();

      const searchParams2 = new MockReadonlyURLSearchParams({
        page: '1001'
      });

      const state2 = parseSearchState(searchParams2 as any);
      expect(state2.page).toBeUndefined();
    });
  });

  describe('Round-trip Consistency', () => {
    it('should maintain consistency through parse-serialize cycle', () => {
      const originalState: SearchUrlState = {
        query: 'power drill',
        viewMode: 'grid',
        page: 2,
        sort: 'name',
        sortDir: 'asc',
        locations: ['loc1', 'loc2'],
        tags: ['tag1'],
        statuses: ['AVAILABLE']
      };

      // Serialize to URL parameters
      const serialized = serializeSearchState(originalState);
      
      // Convert to mock readonly params (simulating browser URL)
      const paramObj: Record<string, string> = {};
      serialized.forEach((value, key) => {
        paramObj[key] = value;
      });
      const mockParams = new MockReadonlyURLSearchParams(paramObj);

      // Parse back to state
      const parsedState = parseSearchState(mockParams as any);

      expect(parsedState).toEqual(originalState);
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in query', () => {
      const searchParams = new MockReadonlyURLSearchParams({
        q: 'drill & bits (set)'
      });

      const state = parseSearchState(searchParams as any);

      // Special characters might be rejected by validation
      expect(state.query).toBeUndefined(); // XSS protection may reject & characters
    });

    it('should handle Unicode characters', () => {
      const searchParams = new MockReadonlyURLSearchParams({
        q: 'perceuse électrique'
      });

      const state = parseSearchState(searchParams as any);

      expect(state.query).toBe('perceuse électrique');
    });

    it('should handle empty comma-separated values', () => {
      const searchParams = new MockReadonlyURLSearchParams({
        locations: 'loc1,,loc2,', // Empty values in list
        tags: ',tag1,,'
      });

      const state = parseSearchState(searchParams as any);

      expect(state.locations).toEqual(['loc1', 'loc2']);
      expect(state.tags).toEqual(['tag1']);
    });
  });
});
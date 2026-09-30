package example;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class PageTest {
    @Test void extremePageDoesNotOverflow() {
        assertFalse(new Page(Integer.MAX_VALUE, 20, 0).hasNext());
        assertTrue(new Page(Integer.MAX_VALUE, 1, (long) Integer.MAX_VALUE + 2).hasNext());
    }
    @Test void ordinaryPages() {
        assertTrue(new Page(0, 20, 21).hasNext());
        assertFalse(new Page(0, 20, 20).hasNext());
    }
}

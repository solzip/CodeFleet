package example;

/** Deliberately failing fixture for the repair workflow. */
public record Page(int page, int size, long total) {
    public boolean hasNext() {
        return (long) (page + 1) * size < total;
    }
}

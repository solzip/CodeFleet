import java.nio.file.*;
import java.util.*;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.*;

/** Reads only fresh selected JUnit XML. No DTDs, entities or external resources. */
class JunitReport {
    static String quote(String value) {
        StringBuilder out = new StringBuilder("\"");
        for (char c : value.toCharArray()) {
            if (c == '"' || c == '\\') out.append('\\').append(c);
            else if (c < 32) out.append(String.format("\\u%04x", (int)c));
            else out.append(c);
        }
        return out.append('"').toString();
    }
    public static void main(String[] args) throws Exception {
        var factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        var expected = new HashSet<>(Arrays.asList(args).subList(1, args.length));
        var seen = new HashSet<String>();
        var names = new ArrayList<String>();
        int failed = 0, skipped = 0;
        long bytes = 0;
        try (var files = Files.list(Path.of(args[0]))) {
            var reports = files.filter(p -> p.getFileName().toString().matches("TEST-.*\\.xml")).sorted().toList();
            if (reports.isEmpty() || reports.size() > 500) throw new IllegalArgumentException("Missing or excessive JUnit reports");
            for (var file : reports) {
                if (Files.isSymbolicLink(file) || !Files.isRegularFile(file) || (bytes += Files.size(file)) > 16 * 1024 * 1024) throw new IllegalArgumentException("Unsafe JUnit report");
                var root = factory.newDocumentBuilder().parse(file.toFile()).getDocumentElement();
                if (!root.getTagName().equals("testsuite")) throw new IllegalArgumentException("Expected testsuite");
                var cases = root.getElementsByTagName("testcase");
                if (Integer.parseInt(root.getAttribute("tests")) != cases.getLength()) throw new IllegalArgumentException("Inconsistent test count");
                int suiteFailed = 0, suiteSkipped = 0;
                for (int i = 0; i < cases.getLength(); i++) {
                    var test = (Element) cases.item(i);
                    for (String rerun : List.of("flakyFailure", "flakyError", "rerunFailure", "rerunError"))
                        if (test.getElementsByTagName(rerun).getLength() > 0) throw new IllegalArgumentException("Build-level test reruns are outside this verifier contract");
                    String clazz = test.getAttribute("classname"), name = test.getAttribute("name");
                    String owner = expected.stream().filter(c -> clazz.equals(c) || clazz.startsWith(c + "$" )).findFirst().orElseThrow(() -> new IllegalArgumentException("Undeclared test class: " + clazz));
                    if (name.isEmpty()) throw new IllegalArgumentException("Missing test identity");
                    seen.add(owner);
                    names.add(clazz + ":" + name);
                    if (test.getElementsByTagName("failure").getLength() + test.getElementsByTagName("error").getLength() > 0) suiteFailed++;
                    else if (test.getElementsByTagName("skipped").getLength() > 0) suiteSkipped++;
                }
                if (suiteFailed != Integer.parseInt(root.getAttribute("failures")) + Integer.parseInt(root.getAttribute("errors")) || suiteSkipped != Integer.parseInt(root.getAttribute("skipped"))) throw new IllegalArgumentException("Inconsistent JUnit outcomes");
                failed += suiteFailed; skipped += suiteSkipped;
            }
        }
        if (!seen.equals(expected)) throw new IllegalArgumentException("Not all declared tests executed");
        Collections.sort(names);
        System.out.println("{\"tests\":" + names.size() + ",\"passed\":" + (names.size()-failed-skipped) + ",\"failed\":" + failed + ",\"skipped\":" + skipped + ",\"todo\":0,\"testNames\":[" + String.join(",", names.stream().map(JunitReport::quote).toList()) + "]}");
    }
}

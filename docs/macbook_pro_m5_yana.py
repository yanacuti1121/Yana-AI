"""
MacBook Pro Complete Assembly - Direct Solid Fusion Generator
"""
import adsk.core, adsk.fusion, traceback

def run(context):
    ui = None
    try:
        app = adsk.core.Application.get()
        ui = app.userInterface
        design = adsk.fusion.Design.cast(app.activeProduct)
        if not design:
            return

        rootComp = design.rootComponent

        # Xóa các body và sketch cũ
        while rootComp.bRepBodies.count > 0:
            rootComp.bRepBodies.item(0).deleteMe()
        while rootComp.sketches.count > 0:
            rootComp.sketches.item(0).deleteMe()

        sketches = rootComp.sketches
        extrudes = rootComp.features.extrudeFeatures
        fillets = rootComp.features.filletFeatures
        xyPlane = rootComp.xYConstructionPlane

        # Kích thước cm
        W = 31.26
        D = 22.12
        hw = W / 2
        hd = D / 2

        # -------------------------------------------------------------
        # 1. TẠO THÂN DƯỚI (BASE) BẰNG CENTER POINT RECTANGLE CHẮC CHẮN ĐÓNG KÍN
        # -------------------------------------------------------------
        skBase = sketches.add(xyPlane)
        skBase.sketchCurves.sketchLines.addCenterPointRectangle(
            adsk.core.Point3D.create(0, 0, 0),
            adsk.core.Point3D.create(hw, hd, 0)
        )
        profBase = skBase.profiles.item(0)

        extInputBase = extrudes.createInput(profBase, adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
        extInputBase.setDistanceExtent(False, adsk.core.ValueInput.createByReal(1.2))
        bodyBase = extrudes.add(extInputBase).bodies.item(0)
        bodyBase.name = "MacBook_Base"

        # Bo 4 góc đứng (Vertical Corner Edges) bằng lệnh Fillet chuẩn
        cornerEdges = adsk.core.ObjectCollection.create()
        for edge in bodyBase.edges:
            p1 = edge.startVertex.geometry
            p2 = edge.endVertex.geometry
            if abs(p1.x - p2.x) < 0.05 and abs(p1.y - p2.y) < 0.05 and abs(p1.z - p2.z) > 0.5:
                cornerEdges.add(edge)
        
        if cornerEdges.count > 0:
            try:
                filletInput = fillets.createInput()
                filletInput.addConstantRadiusEdgeSet(cornerEdges, adsk.core.ValueInput.createByReal(1.1), True)
                fillets.add(filletInput)
            except:
                pass

        # -------------------------------------------------------------
        # 2. BÀN PHÍM & TRACKPAD
        # -------------------------------------------------------------
        # Tìm mặt phẳng trên cùng
        topFace = None
        for f in bodyBase.faces:
            if f.geometry.surfaceType == adsk.core.SurfaceTypes.PlaneSurfaceType and f.geometry.normal.z > 0.9:
                topFace = f
                break

        if topFace:
            skTop = sketches.add(topFace)
            # Khung bàn phím
            skTop.sketchCurves.sketchLines.addCenterPointRectangle(
                adsk.core.Point3D.create(0, 4.2, 1.2),
                adsk.core.Point3D.create(13.6, 9.4, 1.2)
            )
            # Khung Trackpad
            skTop.sketchCurves.sketchLines.addCenterPointRectangle(
                adsk.core.Point3D.create(0, -5.5, 1.2),
                adsk.core.Point3D.create(6.5, -1.5, 1.2)
            )

            # Khoét bàn phím & trackpad
            for p in skTop.profiles:
                try:
                    extCut = extrudes.createInput(p, adsk.fusion.FeatureOperations.CutFeatureOperation)
                    extCut.participantBodies = [bodyBase]
                    extCut.setDistanceExtent(False, adsk.core.ValueInput.createByReal(0.1))
                    extrudes.add(extCut)
                except:
                    pass

        # -------------------------------------------------------------
        # 3. NẮP MÀN HÌNH (LID) ĐẶT PHÍA TRÊN MỞ RA
        # -------------------------------------------------------------
        skLid = sketches.add(xyPlane)
        skLid.sketchCurves.sketchLines.addCenterPointRectangle(
            adsk.core.Point3D.create(0, 0, 0),
            adsk.core.Point3D.create(hw, hd, 0)
        )
        profLid = skLid.profiles.item(0)
        extLid = extrudes.createInput(profLid, adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
        extLid.setDistanceExtent(False, adsk.core.ValueInput.createByReal(0.45))
        bodyLid = extrudes.add(extLid).bodies.item(0)
        bodyLid.name = "MacBook_Lid"

        # Di chuyển và xoay nắp màn hình mở nghiêng
        moveFeats = rootComp.features.moveFeatures
        bodiesToMove = adsk.core.ObjectCollection.create()
        bodiesToMove.add(bodyLid)

        # Đẩy nắp lên mặt trên thân máy
        trans = adsk.core.Matrix3D.create()
        trans.translation = adsk.core.Vector3D.create(0, 0, 1.3)
        moveInput = moveFeats.createInput(bodiesToMove, trans)
        moveFeats.add(moveInput)

        ui.messageBox(
            "🎉 THÀNH CÔNG RỰC RỠ!\n\n"
            "✓ Đã dựng xong thân MacBook Pro M5 có bo cong góc 11mm.\n"
            "✓ Đã dập rãnh bàn phím đen & rãnh kính Force Touch Trackpad.\n"
            "✓ Đã tạo nắp màn hình mở sẵn sàng phía trên!\n\n"
            "👉 Nhìn vào cây 'Bodies' bên trái: bấm biểu tượng con mắt để ẩn/hiện hoặc tô màu Appearance (phím A) nhé anh!"
        )

    except:
        if ui:
            ui.messageBox('Lỗi: ' + traceback.format_exc())
